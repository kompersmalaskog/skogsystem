import { NextRequest, NextResponse } from 'next/server';
import { fromFile, GeoTIFF, GeoTIFFImage } from 'geotiff';
import path from 'path';

// --- Species definitions: FTP filename → species ---
const SPECIES = [
  { key: 'tall', namn: 'Tall', file: 'SLUskogskarta_volTall.tif' },
  { key: 'gran', namn: 'Gran', file: 'SLUskogskarta_volGran.tif' },
  { key: 'bjork', namn: 'Björk', file: 'SLUskogskarta_volBjork.tif' },
  { key: 'contorta', namn: 'Contorta', file: 'SLUskogskarta_volContorta.tif' },
  { key: 'bok', namn: 'Bok', file: 'SLUskogskarta_volBok.tif' },
  { key: 'ek', namn: 'Ek', file: 'SLUskogskarta_volEk.tif' },
  { key: 'ovrigt', namn: 'Övrigt löv', file: 'SLUskogskarta_volOvrigtLov.tif' },
];

// Module-level cache for open GeoTIFF handles (file seeking, not loaded into memory)
const tiffCache = new Map<string, GeoTIFF>();
const imageCache = new Map<string, GeoTIFFImage>();

const DATA_DIR = path.join(process.cwd(), 'data', 'slu-skogskarta');

async function getImage(filename: string): Promise<GeoTIFFImage> {
  let img = imageCache.get(filename);
  if (img) return img;

  const filePath = path.join(DATA_DIR, filename);
  const tiff = await fromFile(filePath);
  tiffCache.set(filename, tiff);
  img = await tiff.getImage();
  imageCache.set(filename, img);
  return img;
}

// Ray-casting point-in-polygon
function pointInPolygon(
  px: number,
  py: number,
  polygon: number[][],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ring: number[][] = body.ring; // [[x, y], ...] in SWEREF99TM (EPSG:3006)

    if (!ring || ring.length < 3) {
      return NextResponse.json(
        { error: 'ring must have at least 3 coordinate pairs in SWEREF99TM' },
        { status: 400 },
      );
    }

    // Bounding box in SWEREF99TM
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    // Get reference image metadata (all files share the same grid)
    const refImage = await getImage(SPECIES[0].file);
    const [originX, originY] = refImage.getOrigin();
    const [resX, resY] = refImage.getResolution(); // resY is negative (north-up)
    const imgWidth = refImage.getWidth();
    const imgHeight = refImage.getHeight();
    const nodata = refImage.getGDALNoData();

    console.log(`[slu-geotiff] origin=(${originX}, ${originY}) res=(${resX}, ${resY}) size=${imgWidth}x${imgHeight} nodata=${nodata}`);

    // Convert bbox from SWEREF99TM to pixel coordinates
    // col = (easting - originX) / resX
    // row = (northing - originY) / resY  (resY is negative, so row increases downward)
    const col0 = Math.floor((minX - originX) / resX);
    const col1 = Math.ceil((maxX - originX) / resX);
    const row0 = Math.floor((maxY - originY) / resY); // maxY → top row (smaller row number)
    const row1 = Math.ceil((minY - originY) / resY);   // minY → bottom row

    // Clamp to image bounds
    const x0 = Math.max(0, Math.min(col0, imgWidth - 1));
    const x1 = Math.max(0, Math.min(col1, imgWidth));
    const y0 = Math.max(0, Math.min(row0, imgHeight - 1));
    const y1 = Math.max(0, Math.min(row1, imgHeight));

    const windowWidth = x1 - x0;
    const windowHeight = y1 - y0;

    console.log(`[slu-geotiff] bbox SWEREF=(${minX.toFixed(0)},${minY.toFixed(0)})-(${maxX.toFixed(0)},${maxY.toFixed(0)}) window=[${x0},${y0},${x1},${y1}] ${windowWidth}x${windowHeight}px`);

    if (windowWidth <= 0 || windowHeight <= 0) {
      return NextResponse.json({ values: [], insideCount: 0 });
    }

    // Build point-in-polygon mask
    const insideMask: boolean[] = new Array(windowWidth * windowHeight);
    let insideCount = 0;
    for (let row = 0; row < windowHeight; row++) {
      for (let col = 0; col < windowWidth; col++) {
        // Pixel center → SWEREF99TM coordinates
        const px = originX + (x0 + col + 0.5) * resX;
        const py = originY + (y0 + row + 0.5) * resY;
        const inside = pointInPolygon(px, py, ring);
        insideMask[row * windowWidth + col] = inside;
        if (inside) insideCount++;
      }
    }

    console.log(`[slu-geotiff] insideCount=${insideCount} of ${windowWidth * windowHeight} pixels`);

    if (insideCount === 0) {
      return NextResponse.json({ values: [], insideCount: 0 });
    }

    // Read each species file in parallel, compute mean within polygon
    const window = [x0, y0, x1, y1] as [number, number, number, number];
    const results = await Promise.all(
      SPECIES.map(async (sp) => {
        try {
          const img = await getImage(sp.file);
          const rasters = await img.readRasters({ window });
          const data = rasters[0] as Int16Array | Uint16Array | Float32Array;

          let sum = 0;
          let validCount = 0;
          for (let i = 0; i < insideMask.length; i++) {
            if (!insideMask[i]) continue;
            const val = data[i];
            // Skip nodata values (typically -9999, 32767, or similar)
            if (nodata !== null && val === nodata) continue;
            if (val < 0) continue;
            sum += val;
            validCount++;
          }

          const mean = validCount > 0 ? sum / validCount : 0;
          return { key: sp.key, namn: sp.namn, meanRaw: mean, pixelCount: validCount };
        } catch (e) {
          console.error(`[slu-geotiff] Error reading ${sp.file}: ${e}`);
          return { key: sp.key, namn: sp.namn, meanRaw: 0, pixelCount: 0 };
        }
      }),
    );

    console.log(
      `[slu-geotiff] Results: ${results.map((r) => `${r.key}=${r.meanRaw.toFixed(0)}`).join(', ')}`,
    );

    return NextResponse.json({
      values: results,
      insideCount,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error(`[slu-geotiff] ERROR: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
