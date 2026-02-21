#!/usr/bin/env python3
"""
Download Lantmäteriet 1m DEM tiles from STAC API, merge, reproject to EPSG:3857,
and create Terrarium-encoded terrain tiles for MapLibre GL JS.

Terrarium encoding: height = (R * 256 + G + B / 256) - 32768

Usage:
  1. Register at https://opendata.lantmateriet.se
  2. Subscribe to STAC-höjd in the API Portal
  3. Create a client application → get client_id and client_secret
  4. Set environment variables:
       LM_CLIENT_ID=<your_client_id>
       LM_CLIENT_SECRET=<your_client_secret>
  5. Run: python3 scripts/build-terrain-tiles.py
"""

import json
import math
import os
import sys
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from rasterio.merge import merge
from rasterio.warp import calculate_default_transform, reproject, Resampling
from rasterio.transform import from_bounds

# === CONFIG ===
CENTER_LON = 15.85
CENTER_LAT = 56.65
SEARCH_BBOX = [15.76, 56.59, 15.94, 56.71]  # ~12km x 12km
MIN_ZOOM = 10
MAX_ZOOM = 15
TILE_SIZE = 256

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_DIR / "public" / "terrain-tiles"
TEMP_DIR = PROJECT_DIR / "data" / "terrain-tmp"
STAC_SEARCH_URL = "https://api.lantmateriet.se/stac-hojd/v1/search"
TOKEN_URL = "https://api.lantmateriet.se/token"


def get_oauth2_token():
    """Get OAuth2 bearer token from Lantmäteriet API Portal."""
    client_id = os.environ.get("LM_CLIENT_ID")
    client_secret = os.environ.get("LM_CLIENT_SECRET")
    if not client_id or not client_secret:
        print("ERROR: Set LM_CLIENT_ID and LM_CLIENT_SECRET environment variables.")
        print("       Register at https://opendata.lantmateriet.se")
        print("       Subscribe to STAC-höjd in the API Portal")
        print("       Create a client application to get credentials")
        sys.exit(1)

    import base64
    auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    data = "grant_type=client_credentials".encode()
    req = urllib.request.Request(TOKEN_URL, data=data, headers={
        "Authorization": f"Basic {auth}",
        "Content-Type": "application/x-www-form-urlencoded",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            token_data = json.loads(resp.read())
        token = token_data["access_token"]
        print(f"[auth] Got OAuth2 token (expires in {token_data.get('expires_in', '?')}s)")
        return token
    except Exception as e:
        print(f"ERROR: Failed to get OAuth2 token: {e}")
        sys.exit(1)


def search_stac_tiles():
    """Search STAC API for DEM tiles covering the area."""
    bbox_str = ",".join(str(x) for x in SEARCH_BBOX)
    url = f"{STAC_SEARCH_URL}?collections=mhm-62_5&bbox={bbox_str}&limit=50"
    print(f"[STAC] Searching: {url}")
    with urllib.request.urlopen(url, timeout=30) as resp:
        data = json.loads(resp.read())
    features = data.get("features", [])
    print(f"[STAC] Found {len(features)} tiles")
    return features


def download_tile(url, dest_path, token):
    """Download a single GeoTIFF tile with OAuth2 bearer token."""
    if dest_path.exists() and dest_path.stat().st_size > 1000:
        print(f"  [skip] {dest_path.name} already exists")
        return
    print(f"  [download] {dest_path.name} ...")
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
    })
    with urllib.request.urlopen(req, timeout=120) as resp:
        with open(str(dest_path), "wb") as f:
            f.write(resp.read())
    size_mb = dest_path.stat().st_size / 1024 / 1024
    print(f"  [done] {size_mb:.1f} MB")


def merge_and_reproject(tif_paths, output_path):
    """Merge multiple GeoTIFFs and reproject to EPSG:3857."""
    print(f"\n[merge] Merging {len(tif_paths)} tiles...")
    datasets = [rasterio.open(p) for p in tif_paths]
    mosaic, mosaic_transform = merge(datasets)
    mosaic_crs = datasets[0].crs
    for ds in datasets:
        ds.close()

    print(f"[merge] Mosaic shape: {mosaic.shape}, CRS: {mosaic_crs}")

    dst_crs = "EPSG:3857"
    transform, width, height = calculate_default_transform(
        mosaic_crs, dst_crs,
        mosaic.shape[2], mosaic.shape[1],
        left=mosaic_transform.c,
        bottom=mosaic_transform.f + mosaic_transform.e * mosaic.shape[1],
        right=mosaic_transform.c + mosaic_transform.a * mosaic.shape[2],
        top=mosaic_transform.f,
    )

    print(f"[reproject] To EPSG:3857: {width}x{height}")

    reprojected = np.zeros((1, height, width), dtype=np.float32)
    reproject(
        source=mosaic[0],
        destination=reprojected[0],
        src_transform=mosaic_transform,
        src_crs=mosaic_crs,
        dst_transform=transform,
        dst_crs=dst_crs,
        resampling=Resampling.bilinear,
    )

    profile = {
        "driver": "GTiff",
        "dtype": "float32",
        "width": width,
        "height": height,
        "count": 1,
        "crs": dst_crs,
        "transform": transform,
        "compress": "deflate",
    }
    with rasterio.open(str(output_path), "w", **profile) as dst:
        dst.write(reprojected)

    print(f"[reproject] Saved: {output_path} ({output_path.stat().st_size / 1024 / 1024:.1f} MB)")
    return output_path


def lat_lon_to_tile(lat, lon, zoom):
    """Convert lat/lon to tile x/y at given zoom."""
    n = 2 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def tile_bounds_3857(x, y, z):
    """Get EPSG:3857 bounds for a tile."""
    n = 2 ** z
    ORIGIN = 20037508.342789244
    tile_size = 2 * ORIGIN / n
    minx = -ORIGIN + x * tile_size
    maxy = ORIGIN - y * tile_size
    maxx = minx + tile_size
    miny = maxy - tile_size
    return minx, miny, maxx, maxy


def encode_terrarium(height_array):
    """Encode height values to Terrarium RGB."""
    encoded = height_array + 32768.0
    encoded = np.clip(encoded, 0, 65535.999)
    r = np.floor(encoded / 256.0).astype(np.uint8)
    g = (np.floor(encoded) % 256).astype(np.uint8)
    b = np.floor((encoded - np.floor(encoded)) * 256.0).astype(np.uint8)
    return np.stack([r, g, b], axis=0)


def write_png(path, rgb_array):
    """Write a 3-band uint8 array as PNG without Pillow."""
    import struct
    import zlib

    channels, height, width = rgb_array.shape
    assert channels == 3

    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter byte
        for x in range(width):
            raw_data.append(int(rgb_array[0, y, x]))
            raw_data.append(int(rgb_array[1, y, x]))
            raw_data.append(int(rgb_array[2, y, x]))

    compressed = zlib.compress(bytes(raw_data), 9)

    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        return struct.pack(">I", len(data)) + c + crc

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", compressed)
    png += chunk(b"IEND", b"")

    with open(str(path), "wb") as f:
        f.write(png)


def generate_terrain_tiles(dem_path, output_dir, min_zoom, max_zoom):
    """Generate Terrarium-encoded PNG tiles from the reprojected DEM."""
    output_dir = Path(output_dir)

    with rasterio.open(str(dem_path)) as src:
        dem_bounds = src.bounds
        print(f"\n[tiles] DEM bounds (3857): {dem_bounds}")
        print(f"[tiles] DEM shape: {src.width}x{src.height}")

    total_tiles = 0

    for zoom in range(min_zoom, max_zoom + 1):
        from rasterio.warp import transform as warp_transform
        corners_3857_x = [dem_bounds.left, dem_bounds.right]
        corners_3857_y = [dem_bounds.bottom, dem_bounds.top]
        corners_4326 = warp_transform("EPSG:3857", "EPSG:4326", corners_3857_x, corners_3857_y)
        lon_min, lon_max = corners_4326[0][0], corners_4326[0][1]
        lat_min, lat_max = corners_4326[1][0], corners_4326[1][1]

        tx_min, ty_max = lat_lon_to_tile(lat_min, lon_min, zoom)
        tx_max, ty_min = lat_lon_to_tile(lat_max, lon_max, zoom)
        if tx_min > tx_max: tx_min, tx_max = tx_max, tx_min
        if ty_min > ty_max: ty_min, ty_max = ty_max, ty_min

        n_tiles = (tx_max - tx_min + 1) * (ty_max - ty_min + 1)
        print(f"\n[tiles] Zoom {zoom}: tiles x={tx_min}-{tx_max}, y={ty_min}-{ty_max} ({n_tiles} tiles)")

        zoom_count = 0
        with rasterio.open(str(dem_path)) as src:
            for tx in range(tx_min, tx_max + 1):
                for ty in range(ty_min, ty_max + 1):
                    t_minx, t_miny, t_maxx, t_maxy = tile_bounds_3857(tx, ty, zoom)

                    if (t_maxx < dem_bounds.left or t_minx > dem_bounds.right or
                            t_maxy < dem_bounds.bottom or t_miny > dem_bounds.top):
                        continue

                    tile_transform = from_bounds(t_minx, t_miny, t_maxx, t_maxy, TILE_SIZE, TILE_SIZE)
                    tile_data = np.zeros((1, TILE_SIZE, TILE_SIZE), dtype=np.float32)
                    reproject(
                        source=rasterio.band(src, 1),
                        destination=tile_data[0],
                        src_transform=src.transform,
                        src_crs=src.crs,
                        dst_transform=tile_transform,
                        dst_crs="EPSG:3857",
                        resampling=Resampling.bilinear,
                    )

                    valid = tile_data[0][tile_data[0] != 0]
                    if len(valid) == 0:
                        continue

                    if src.nodata is not None:
                        tile_data[0][tile_data[0] == src.nodata] = 0

                    rgb = encode_terrarium(tile_data[0])

                    tile_dir = output_dir / str(zoom) / str(tx)
                    tile_dir.mkdir(parents=True, exist_ok=True)
                    tile_path = tile_dir / f"{ty}.png"
                    write_png(tile_path, rgb)
                    zoom_count += 1

        total_tiles += zoom_count
        print(f"[tiles] Zoom {zoom}: {zoom_count} tiles written")

    print(f"\n[tiles] Total: {total_tiles} tiles written to {output_dir}")
    return total_tiles


def main():
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Step 1: Get OAuth2 token
    token = get_oauth2_token()

    # Step 2: Search STAC for tiles
    features = search_stac_tiles()
    if not features:
        print("ERROR: No tiles found!")
        sys.exit(1)

    # Step 3: Download tiles
    print(f"\n[download] Downloading {len(features)} tiles to {TEMP_DIR}")
    tif_paths = []
    for f in features:
        asset = f["assets"]["data"]
        url = asset["href"]
        filename = url.split("/")[-1]
        dest = TEMP_DIR / filename
        download_tile(url, dest, token)
        tif_paths.append(dest)

    # Step 4: Merge and reproject
    merged_path = TEMP_DIR / "merged_3857.tif"
    merge_and_reproject(tif_paths, merged_path)

    # Step 5: Generate terrain tiles
    total = generate_terrain_tiles(merged_path, OUTPUT_DIR, MIN_ZOOM, MAX_ZOOM)

    # Step 6: Write bounds metadata
    bounds_file = OUTPUT_DIR / "bounds.json"
    bounds_data = {
        "center": [CENTER_LON, CENTER_LAT],
        "bbox": SEARCH_BBOX,
        "minZoom": MIN_ZOOM,
        "maxZoom": MAX_ZOOM,
        "tileCount": total,
        "encoding": "terrarium",
    }
    with open(str(bounds_file), "w") as f:
        json.dump(bounds_data, f, indent=2)

    print(f"\n[DONE] {total} terrain tiles in {OUTPUT_DIR}")
    print(f"[DONE] Bounds: {bounds_file}")

    total_size = sum(p.stat().st_size for p in OUTPUT_DIR.rglob("*.png"))
    print(f"[DONE] Total size: {total_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
