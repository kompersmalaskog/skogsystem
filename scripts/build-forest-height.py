#!/usr/bin/env python3
"""
Download tree height raster from Skogsstyrelsen's ArcGIS ImageServer
and convert to a GeoJSON grid of polygons with height attributes.

Usage:
    python scripts/build-forest-height.py

Requires: pip install rasterio numpy pyproj
Reads SKS_WMS_USER / SKS_WMS_PASS from .env.local in project root.
Output: public/forest-height.geojson
"""

import json
import os
import struct
import sys
import tempfile
import urllib.request
import urllib.parse
import base64
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# Bbox in EPSG:4326 (lon/lat) covering Kompersmala area
BBOX_4326 = [15.76, 56.59, 15.94, 56.71]

# Target cell size in meters (50m ideal but GeoJSON > 15MB, 65m = ~14MB)
CELL_SIZE_M = 65

# Minimum tree height to keep (filters open land / clear-cuts)
MIN_HEIGHT_M = 2.0

# ArcGIS ImageServer for Tradhojd
TRADHOJD_SERVICE = (
    "https://geodata.skogsstyrelsen.se/arcgis/rest/services/"
    "Publikt/Tradhojd_3_1/ImageServer"
)

# Fallback: SkogligaGrunddata band 1 (tree height in dm)
SKOGLIGA_SERVICE = (
    "https://geodata.skogsstyrelsen.se/arcgis/rest/services/"
    "Publikt/SkogligaGrunddata_3_1/ImageServer"
)

# Browser UA (Skogsstyrelsen WAF blocks scripts)
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = PROJECT_ROOT / "public" / "forest-height.geojson"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_env():
    """Read .env.local for SKS credentials."""
    env_file = PROJECT_ROOT / ".env.local"
    if not env_file.exists():
        print(f"ERROR: {env_file} not found")
        sys.exit(1)
    env = {}
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def bbox_4326_to_3857(bbox):
    """Convert EPSG:4326 bbox to EPSG:3857 (Web Mercator)."""
    import math
    def to_3857(lon, lat):
        x = lon * 20037508.34 / 180.0
        y = math.log(math.tan((90 + lat) * math.pi / 360.0)) / (math.pi / 180.0)
        y = y * 20037508.34 / 180.0
        return x, y
    x_min, y_min = to_3857(bbox[0], bbox[1])
    x_max, y_max = to_3857(bbox[2], bbox[3])
    return [x_min, y_min, x_max, y_max]


def download_tiff(service_url, bbox_3857, width, height, user, password, band_ids=None):
    """Download raw raster as TIFF from ArcGIS ImageServer exportImage."""
    params = {
        "bbox": f"{bbox_3857[0]},{bbox_3857[1]},{bbox_3857[2]},{bbox_3857[3]}",
        "bboxSR": "3857",
        "imageSR": "3857",
        "size": f"{width},{height}",
        "format": "tiff",
        "pixelType": "F32",
        "noDataInterpretation": "esriNoDataMatchAny",
        "interpolation": "+RSP_NearestNeighbor",
        "renderingRule": json.dumps({"rasterFunction": "None"}),
        "f": "image",
    }
    if band_ids:
        params["bandIds"] = band_ids

    url = f"{service_url}/exportImage?{urllib.parse.urlencode(params)}"
    print(f"Downloading TIFF from:\n  {url[:120]}...")

    credentials = base64.b64encode(f"{user}:{password}".encode()).decode()
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Authorization": f"Basic {credentials}",
    })

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = resp.read()
            content_type = resp.headers.get("Content-Type", "")
            print(f"  Response: {len(data)} bytes, Content-Type: {content_type}")
            if b"error" in data[:200].lower() or content_type.startswith("application/json"):
                print(f"  ERROR response: {data[:500].decode('utf-8', errors='replace')}")
                return None
            return data
    except Exception as e:
        print(f"  Download failed: {e}")
        return None


def download_png_raw(service_url, bbox_3857, width, height, user, password, band_ids=None):
    """Fallback: download as PNG with renderingRule=None (8-bit values)."""
    params = {
        "bbox": f"{bbox_3857[0]},{bbox_3857[1]},{bbox_3857[2]},{bbox_3857[3]}",
        "bboxSR": "3857",
        "imageSR": "3857",
        "size": f"{width},{height}",
        "format": "png",
        "transparent": "true",
        "renderingRule": json.dumps({"rasterFunction": "None"}),
        "f": "image",
    }
    if band_ids:
        params["bandIds"] = band_ids

    url = f"{service_url}/exportImage?{urllib.parse.urlencode(params)}"
    print(f"Downloading PNG from:\n  {url[:120]}...")

    credentials = base64.b64encode(f"{user}:{password}".encode()).decode()
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Authorization": f"Basic {credentials}",
    })

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = resp.read()
            content_type = resp.headers.get("Content-Type", "")
            print(f"  Response: {len(data)} bytes, Content-Type: {content_type}")
            if content_type.startswith("application/json"):
                print(f"  ERROR response: {data[:500].decode('utf-8', errors='replace')}")
                return None
            return data
    except Exception as e:
        print(f"  Download failed: {e}")
        return None


def tiff_to_array(tiff_data):
    """Read TIFF data into numpy array using rasterio."""
    import rasterio
    import numpy as np
    with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
        tmp.write(tiff_data)
        tmp_path = tmp.name
    try:
        with rasterio.open(tmp_path) as src:
            data = src.read(1)  # Band 1
            nodata = src.nodata
            print(f"  Raster: {src.width}x{src.height}, dtype={src.dtypes[0]}, nodata={nodata}")
            print(f"  Value range: {np.nanmin(data):.2f} - {np.nanmax(data):.2f}")
            transform = src.transform
            return data, nodata, transform
    finally:
        os.unlink(tmp_path)


def png_to_array(png_data):
    """Read PNG data into numpy array (first channel = raw pixel value)."""
    import numpy as np
    # Use PIL if available, otherwise use basic PNG reading
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(png_data))
        arr = np.array(img)
        if arr.ndim == 3:
            # Use first channel (R for grayscale in RGB)
            return arr[:, :, 0].astype(np.float32)
        return arr.astype(np.float32)
    except ImportError:
        print("  PIL not available, trying rasterio for PNG")
        import rasterio
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(png_data)
            tmp_path = tmp.name
        try:
            with rasterio.open(tmp_path) as src:
                return src.read(1).astype(np.float32)
        finally:
            os.unlink(tmp_path)


def build_geojson(data, nodata, bbox_3857, cell_w, cell_h, is_decimeters=False):
    """Convert raster grid to GeoJSON polygons in EPSG:4326."""
    import numpy as np
    import math

    rows, cols = data.shape
    x_min, y_min, x_max, y_max = bbox_3857

    # Pixel size in meters (EPSG:3857)
    px_w = (x_max - x_min) / cols
    px_h = (y_max - y_min) / rows

    # Group pixels into cells
    px_per_cell_x = max(1, int(round(cell_w / px_w)))
    px_per_cell_y = max(1, int(round(cell_h / px_h)))

    print(f"  Pixel size: {px_w:.1f} x {px_h:.1f} m")
    print(f"  Pixels per cell: {px_per_cell_x} x {px_per_cell_y}")

    def to_4326(x, y):
        lon = x * 180.0 / 20037508.34
        lat = math.atan(math.exp(y * math.pi / 20037508.34)) * 360.0 / math.pi - 90.0
        return round(lon, 4), round(lat, 4)

    features = []
    n_cells_x = cols // px_per_cell_x
    n_cells_y = rows // px_per_cell_y

    print(f"  Grid: {n_cells_x} x {n_cells_y} = {n_cells_x * n_cells_y} cells")

    for cy in range(n_cells_y):
        for cx in range(n_cells_x):
            # Extract cell block
            r0 = cy * px_per_cell_y
            r1 = r0 + px_per_cell_y
            c0 = cx * px_per_cell_x
            c1 = c0 + px_per_cell_x
            block = data[r0:r1, c0:c1]

            # Skip if all nodata
            if nodata is not None:
                valid = block[block != nodata]
            else:
                valid = block[np.isfinite(block)]

            if len(valid) == 0:
                continue

            height = float(np.mean(valid))

            if is_decimeters:
                height = height / 10.0

            # Round to 1 decimal
            height = round(height, 1)

            if height < MIN_HEIGHT_M:
                continue

            # Cell bounds in EPSG:3857
            cx_min = x_min + cx * px_per_cell_x * px_w
            cx_max = cx_min + px_per_cell_x * px_w
            # Note: raster row 0 = top of image = y_max
            cy_max = y_max - cy * px_per_cell_y * px_h
            cy_min = cy_max - px_per_cell_y * px_h

            # Convert corners to WGS84
            sw = to_4326(cx_min, cy_min)
            ne = to_4326(cx_max, cy_max)

            coords = [[
                [sw[0], sw[1]],
                [ne[0], sw[1]],
                [ne[0], ne[1]],
                [sw[0], ne[1]],
                [sw[0], sw[1]],
            ]]

            features.append({
                "type": "Feature",
                "properties": {"height": height},
                "geometry": {"type": "Polygon", "coordinates": coords},
            })

    return {"type": "FeatureCollection", "features": features}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    env = load_env()
    user = env.get("SKS_WMS_USER")
    password = env.get("SKS_WMS_PASS")
    if not user or not password:
        print("ERROR: SKS_WMS_USER and SKS_WMS_PASS must be set in .env.local")
        sys.exit(1)

    print(f"Credentials: {user} / {'*' * len(password)}")

    bbox_3857 = bbox_4326_to_3857(BBOX_4326)
    print(f"Bbox EPSG:4326: {BBOX_4326}")
    print(f"Bbox EPSG:3857: [{bbox_3857[0]:.0f}, {bbox_3857[1]:.0f}, {bbox_3857[2]:.0f}, {bbox_3857[3]:.0f}]")

    # Calculate raster size for target resolution
    extent_x = bbox_3857[2] - bbox_3857[0]
    extent_y = bbox_3857[3] - bbox_3857[1]
    width = int(extent_x / CELL_SIZE_M)
    height = int(extent_y / CELL_SIZE_M)
    print(f"Extent: {extent_x:.0f} x {extent_y:.0f} m")
    print(f"Raster size: {width} x {height} px (one pixel per cell)")

    # --- Strategy 1: Tradhojd_3_1 as TIFF ---
    print("\n=== Strategy 1: Tradhojd_3_1 (TIFF, float32) ===")
    tiff_data = download_tiff(TRADHOJD_SERVICE, bbox_3857, width, height, user, password)

    data = None
    nodata = None
    is_dm = False

    if tiff_data and len(tiff_data) > 100:
        try:
            data, nodata, _ = tiff_to_array(tiff_data)
        except Exception as e:
            print(f"  Failed to read TIFF: {e}")

    # --- Strategy 2: Tradhojd_3_1 as PNG ---
    if data is None:
        print("\n=== Strategy 2: Tradhojd_3_1 (PNG, 8-bit) ===")
        png_data = download_png_raw(TRADHOJD_SERVICE, bbox_3857, width, height, user, password)
        if png_data and len(png_data) > 100:
            try:
                data = png_to_array(png_data)
                nodata = 0
                is_dm = True  # PNG values likely in decimeters
                print(f"  Treating as decimeters (will divide by 10)")
            except Exception as e:
                print(f"  Failed to read PNG: {e}")

    # --- Strategy 3: SkogligaGrunddata band 1 ---
    if data is None:
        print("\n=== Strategy 3: SkogligaGrunddata_3_1 band 1 (tree height dm) ===")
        tiff_data = download_tiff(
            SKOGLIGA_SERVICE, bbox_3857, width, height, user, password, band_ids="1"
        )
        if tiff_data and len(tiff_data) > 100:
            try:
                data, nodata, _ = tiff_to_array(tiff_data)
                is_dm = True
                print(f"  SkogligaGrunddata band 1 = tree height in decimeters")
            except Exception as e:
                print(f"  Failed to read TIFF: {e}")

        if data is None:
            # Try PNG fallback
            png_data = download_png_raw(
                SKOGLIGA_SERVICE, bbox_3857, width, height, user, password, band_ids="1"
            )
            if png_data and len(png_data) > 100:
                try:
                    data = png_to_array(png_data)
                    nodata = 0
                    is_dm = True
                except Exception as e:
                    print(f"  Failed to read PNG: {e}")

    if data is None:
        print("\nERROR: All download strategies failed.")
        sys.exit(1)

    import numpy as np
    print(f"\nRaster loaded: {data.shape[1]}x{data.shape[0]}, range: {np.nanmin(data):.1f} - {np.nanmax(data):.1f}")

    # Auto-detect decimeters: if max > 100, values are likely in dm (no tree is 100m+)
    if not is_dm and np.nanmax(data) > 100:
        is_dm = True
        print(f"  Auto-detected decimeters (max value {np.nanmax(data):.1f} > 100)")

    if is_dm:
        print(f"  (values in decimeters, will convert to meters)")

    # Build GeoJSON (one polygon per pixel since we requested 1px = 1 cell)
    geojson = build_geojson(data, nodata, bbox_3857, CELL_SIZE_M, CELL_SIZE_M, is_decimeters=is_dm)

    n_features = len(geojson["features"])
    print(f"\nFeatures: {n_features}")

    if n_features == 0:
        print("WARNING: No features generated. Check data values and MIN_HEIGHT_M threshold.")
        sys.exit(1)

    # Write output
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(geojson, separators=(",", ":"))
    OUTPUT_PATH.write_text(raw, encoding="utf-8")
    size_mb = len(raw) / 1024 / 1024
    print(f"Written: {OUTPUT_PATH}")
    print(f"Size: {size_mb:.1f} MB")

    if size_mb > 10:
        print(f"\nWARNING: File is {size_mb:.1f} MB (> 10 MB target).")
        print("Consider increasing CELL_SIZE_M to 100 and re-running.")

    print("\nDone!")


if __name__ == "__main__":
    main()
