#!/usr/bin/env python3
"""
Download Lantmäteriet 1m DEM tiles via STAC API, merge, reproject to EPSG:3857,
and create Terrarium-encoded terrain tiles for MapLibre GL JS.

Terrarium encoding: height = (R * 256 + G + B / 256) - 32768

Reads LM_SYSTEM_USER and LM_SYSTEM_PASS from .env.local or environment variables.
"""

import base64
import json
import math
import os
import sys
from pathlib import Path

import numpy as np
import requests
import rasterio
from rasterio.merge import merge
from rasterio.warp import calculate_default_transform, reproject, Resampling
from rasterio.transform import from_bounds

# === CONFIG ===
CENTER_LON = 15.85
CENTER_LAT = 56.65
SEARCH_BBOX = [15.76, 56.59, 15.94, 56.71]  # ~12km x 12km around Kompersmala
MIN_ZOOM = 10
MAX_ZOOM = 15
TILE_SIZE = 256

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_DIR / "public" / "terrain-tiles"
TEMP_DIR = PROJECT_DIR / "data" / "terrain-tmp"
STAC_SEARCH_URL = "https://api.lantmateriet.se/stac-hojd/v1/search"


def load_env():
    """Load credentials from .env.local or environment variables."""
    env_file = PROJECT_DIR / ".env.local"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip())

    user = os.environ.get("LM_SYSTEM_USER")
    passwd = os.environ.get("LM_SYSTEM_PASS")
    if not user or not passwd:
        print("ERROR: LM_SYSTEM_USER and LM_SYSTEM_PASS must be set.")
        print("       Add them to .env.local or export as environment variables.")
        sys.exit(1)
    return user, passwd


def search_stac_tiles():
    """Search STAC API for DEM tiles covering the area."""
    bbox_str = ",".join(str(x) for x in SEARCH_BBOX)
    url = f"{STAC_SEARCH_URL}?collections=mhm-62_5&bbox={bbox_str}&limit=50"
    print(f"[STAC] Searching: {url}")
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    features = resp.json().get("features", [])
    print(f"[STAC] Found {len(features)} tiles")
    for f in features:
        bb = f["bbox"]
        sz = f["assets"]["data"].get("file:size", 0) / 1024 / 1024
        print(f"  {f['id']:15s}  lon {bb[0]:.3f}-{bb[2]:.3f}  lat {bb[1]:.3f}-{bb[3]:.3f}  {sz:.1f} MB")
    return features


def download_tile(url, dest_path, auth):
    """Download a single GeoTIFF tile with Basic Auth."""
    if dest_path.exists() and dest_path.stat().st_size > 1000:
        sz = dest_path.stat().st_size / 1024 / 1024
        print(f"  [skip] {dest_path.name} ({sz:.1f} MB)")
        return
    print(f"  [download] {dest_path.name} ...", end="", flush=True)
    resp = requests.get(url, auth=auth, timeout=120, stream=True)
    resp.raise_for_status()
    with open(str(dest_path), "wb") as f:
        for chunk in resp.iter_content(chunk_size=1024 * 1024):
            f.write(chunk)
    sz = dest_path.stat().st_size / 1024 / 1024
    print(f" {sz:.1f} MB")


def merge_and_reproject(tif_paths, output_path):
    """Merge multiple GeoTIFFs and reproject to EPSG:3857."""
    if output_path.exists() and output_path.stat().st_size > 1000:
        print(f"\n[merge] Using existing merged file: {output_path}")
        return output_path

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
        print(f"\n[tiles] Zoom {zoom}: x={tx_min}-{tx_max}, y={ty_min}-{ty_max} ({n_tiles} candidates)")

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

    print(f"\n[tiles] Total: {total_tiles} tiles")
    return total_tiles


def main():
    print("=" * 60)
    print("Lantmateriet 1m DEM -> Terrarium terrain tiles")
    print("=" * 60)

    # Load credentials
    user, passwd = load_env()
    auth = (user, passwd)
    print(f"[auth] Using LM_SYSTEM_USER={user}")

    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Step 1: Search STAC for tiles
    features = search_stac_tiles()
    if not features:
        print("ERROR: No tiles found!")
        sys.exit(1)

    # Step 2: Download tiles
    total_size_est = sum(f["assets"]["data"].get("file:size", 10_000_000) for f in features)
    print(f"\n[download] {len(features)} tiles (~{total_size_est / 1024 / 1024:.0f} MB) -> {TEMP_DIR}")
    tif_paths = []
    for f in features:
        asset = f["assets"]["data"]
        url = asset["href"]
        filename = url.split("/")[-1]
        dest = TEMP_DIR / filename
        download_tile(url, dest, auth)
        tif_paths.append(dest)

    # Step 3: Merge and reproject
    merged_path = TEMP_DIR / "merged_3857.tif"
    merge_and_reproject(tif_paths, merged_path)

    # Step 4: Generate terrain tiles
    total = generate_terrain_tiles(merged_path, OUTPUT_DIR, MIN_ZOOM, MAX_ZOOM)

    # Step 5: Write bounds metadata
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

    print(f"\n{'=' * 60}")
    print(f"DONE! {total} terrain tiles in {OUTPUT_DIR}")
    total_size = sum(p.stat().st_size for p in OUTPUT_DIR.rglob("*.png"))
    print(f"Total tile size: {total_size / 1024 / 1024:.1f} MB")
    print(f"Bounds metadata: {bounds_file}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
