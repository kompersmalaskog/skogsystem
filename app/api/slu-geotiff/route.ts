import { NextRequest, NextResponse } from 'next/server';
import { fromFile, fromArrayBuffer, GeoTIFF, GeoTIFFImage } from 'geotiff';
import path from 'path';
import fs from 'fs';

// --- Species definitions ---
// Local files: one GeoTIFF per species (EPSG:3006, 12.5m pixel)
// Remote bands: SLUskogskarta_1_0 ImageServer multiband (band 5-11)
const SPECIES = [
  { key: 'tall', namn: 'Tall', file: 'SLUskogskarta_volTall.tif', band: 5 },
  { key: 'gran', namn: 'Gran', file: 'SLUskogskarta_volGran.tif', band: 6 },
  { key: 'bjork', namn: 'Björk', file: 'SLUskogskarta_volBjork.tif', band: 7 },
  { key: 'contorta', namn: 'Contorta', file: 'SLUskogskarta_volContorta.tif', band: 8 },
  { key: 'bok', namn: 'Bok', file: 'SLUskogskarta_volBok.tif', band: 9 },
  { key: 'ek', namn: 'Ek', file: 'SLUskogskarta_volEk.tif', band: 10 },
  { key: 'ovrigt', namn: 'Övrigt löv', file: 'SLUskogskarta_volOvrigtLov.tif', band: 11 },
];

const SLU_SERVICE = 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/SLUskogskarta_1_0/ImageServer';
const SLU_PIXEL_SIZE = 12.5; // meters

// Module-level cache for open GeoTIFF handles
const tiffCache = new Map<string, GeoTIFF>();
const imageCache = new Map<string, GeoTIFFImage>();

const DATA_DIR = path.join(process.cwd(), 'data', 'slu-skogskarta');

type SpeciesResult = { key: string; namn: string; meanRaw: number; pixelCount: number };
type ComputeResult = { values: SpeciesResult[]; insideCount: number; source: string };

// Check if local GeoTIFF files exist
let localFilesAvailable: boolean | null = null;
function hasLocalFiles(): boolean {
  if (localFilesAvailable !== null) return localFilesAvailable;
  try {
    const firstFile = path.join(DATA_DIR, SPECIES[0].file);
    localFilesAvailable = fs.existsSync(firstFile);
    console.log(`[slu-geotiff] Lokala filer ${localFilesAvailable ? 'tillgängliga' : 'saknas'}: ${DATA_DIR}`);
  } catch {
    localFilesAvailable = false;
  }
  return localFilesAvailable;
}

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

function sksAuthHeaders(): Record<string, string> {
  const user = process.env.SKS_WMS_USER;
  const pass = process.env.SKS_WMS_PASS;
  if (!user || !pass) throw new Error('SKS credentials not configured');
  return {
    Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
  };
}

// Ray-casting point-in-polygon
function pointInPolygon(px: number, py: number, polygon: number[][]): boolean {
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

// =====================================================================
// Strategy 1: computeStatisticsHistograms with pixelSize
// =====================================================================
// The default computeStatisticsHistograms on mosaic datasets returns
// tile-level statistics (~50-100km). Adding pixelSize forces the server
// to compute statistics at native pixel resolution within the polygon.
async function computeRemoteStats(
  ring: number[][],
  minX: number, minY: number, maxX: number, maxY: number,
): Promise<ComputeResult> {
  const geometry = JSON.stringify({ rings: [ring] });
  const formParams = new URLSearchParams({
    geometry,
    geometryType: 'esriGeometryPolygon',
    geometrySR: '3006',
    pixelSize: JSON.stringify({ x: SLU_PIXEL_SIZE, y: SLU_PIXEL_SIZE }),
    f: 'json',
  });

  const url = `${SLU_SERVICE}/computeStatisticsHistograms`;
  console.log(`[slu-geotiff] Strategy 1: computeStatisticsHistograms med pixelSize=${SLU_PIXEL_SIZE}`);

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      ...sksAuthHeaders(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formParams.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`computeStats ${resp.status}: ${text.slice(0, 200)}`);
  }

  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('html')) {
    throw new Error('computeStats returned HTML instead of JSON');
  }

  const data = await resp.json();
  if (data.error) {
    throw new Error(`computeStats error: ${JSON.stringify(data.error).slice(0, 200)}`);
  }

  const stats = data.statistics || [];
  if (stats.length === 0) {
    throw new Error('computeStats returned 0 bands');
  }

  // Validate: check if pixel count is reasonable for per-pixel statistics
  // For a polygon of area A at 12.5m resolution, expected pixels ≈ A / (12.5²)
  const bboxArea = (maxX - minX) * (maxY - minY);
  const expectedPixels = Math.max(1, bboxArea / (SLU_PIXEL_SIZE * SLU_PIXEL_SIZE));
  const actualCount = stats[0]?.count || 0;

  console.log(`[slu-geotiff] Strategy 1 result: ${stats.length} bands, count=${actualCount}, expected≈${Math.round(expectedPixels)}`);

  // If pixel count is < 10% of expected, it's tile-level data, not per-pixel
  if (actualCount < expectedPixels * 0.1 && actualCount <= 20) {
    throw new Error(`Tile-level data detected: count=${actualCount}, expected≈${Math.round(expectedPixels)}`);
  }

  const results: SpeciesResult[] = SPECIES.map(sp => {
    if (sp.band >= stats.length) return { key: sp.key, namn: sp.namn, meanRaw: 0, pixelCount: 0 };
    const s = stats[sp.band];
    return {
      key: sp.key,
      namn: sp.namn,
      meanRaw: s.count > 0 ? (s.mean || 0) : 0,
      pixelCount: s.count || 0,
    };
  });

  return { values: results, insideCount: actualCount, source: 'computeStats+pixelSize' };
}

// =====================================================================
// Strategy 2: exportImage → GeoTIFF → per-pixel statistics
// =====================================================================
// Downloads actual pixel data as GeoTIFF and computes statistics locally.
// Guaranteed per-pixel accuracy since we read the actual raster values.
async function computeRemoteExport(
  ring: number[][],
  minX: number, minY: number, maxX: number, maxY: number,
): Promise<ComputeResult> {
  const bandIds = SPECIES.map(s => s.band).join(',');
  const buf = SLU_PIXEL_SIZE / 2;
  const bMinX = minX - buf, bMinY = minY - buf;
  const bMaxX = maxX + buf, bMaxY = maxY + buf;
  const width = Math.max(1, Math.ceil((bMaxX - bMinX) / SLU_PIXEL_SIZE));
  const height = Math.max(1, Math.ceil((bMaxY - bMinY) / SLU_PIXEL_SIZE));

  const params = new URLSearchParams({
    bbox: `${bMinX},${bMinY},${bMaxX},${bMaxY}`,
    bboxSR: '3006',
    imageSR: '3006',
    size: `${width},${height}`,
    format: 'tiff',
    pixelType: 'F32',
    bandIds,
    interpolation: 'RSP_NearestNeighbor',
    f: 'image',
  });

  const url = `${SLU_SERVICE}/exportImage?${params.toString()}`;
  console.log(`[slu-geotiff] Strategy 2: exportImage ${width}x${height}px, bands=${bandIds}`);

  const resp = await fetch(url, { headers: sksAuthHeaders() });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`exportImage ${resp.status}: ${text.slice(0, 200)}`);
  }

  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('json') || contentType.includes('html')) {
    const text = await resp.text();
    throw new Error(`exportImage returned ${contentType}: ${text.slice(0, 200)}`);
  }

  const tiffBuf = await resp.arrayBuffer();
  console.log(`[slu-geotiff] Strategy 2: ${tiffBuf.byteLength} bytes TIFF`);

  if (tiffBuf.byteLength < 100) {
    throw new Error(`exportImage returned only ${tiffBuf.byteLength} bytes`);
  }

  const tiff = await fromArrayBuffer(tiffBuf);
  const image = await tiff.getImage();
  const [originX, originY] = image.getOrigin();
  const [resX, resY] = image.getResolution();
  const imgWidth = image.getWidth();
  const imgHeight = image.getHeight();
  const bandCount = image.getSamplesPerPixel();

  console.log(`[slu-geotiff] Strategy 2 image: ${imgWidth}x${imgHeight}px, ${bandCount} bands, res=(${resX.toFixed(1)},${resY.toFixed(1)})`);

  if (imgWidth <= 0 || imgHeight <= 0 || bandCount === 0) {
    return { values: [], insideCount: 0, source: 'exportImage' };
  }

  // Build polygon mask
  const insideMask: boolean[] = new Array(imgWidth * imgHeight);
  let insideCount = 0;
  for (let row = 0; row < imgHeight; row++) {
    for (let col = 0; col < imgWidth; col++) {
      const px = originX + (col + 0.5) * resX;
      const py = originY + (row + 0.5) * resY;
      const inside = pointInPolygon(px, py, ring);
      insideMask[row * imgWidth + col] = inside;
      if (inside) insideCount++;
    }
  }

  console.log(`[slu-geotiff] Strategy 2: ${insideCount} of ${imgWidth * imgHeight} pixels inside polygon`);

  if (insideCount === 0) {
    return { values: [], insideCount: 0, source: 'exportImage' };
  }

  const rasters = await image.readRasters();

  const results: SpeciesResult[] = SPECIES.map((sp, bandIdx) => {
    if (bandIdx >= bandCount) {
      return { key: sp.key, namn: sp.namn, meanRaw: 0, pixelCount: 0 };
    }
    const data = rasters[bandIdx] as Int16Array | Uint16Array | Float32Array;
    let sum = 0, validCount = 0;
    for (let i = 0; i < insideMask.length; i++) {
      if (!insideMask[i]) continue;
      const val = data[i];
      if (val < 0 || val > 100000) continue;
      sum += val;
      validCount++;
    }
    return {
      key: sp.key,
      namn: sp.namn,
      meanRaw: validCount > 0 ? sum / validCount : 0,
      pixelCount: validCount,
    };
  });

  return { values: results, insideCount, source: 'exportImage' };
}

// =====================================================================
// Local path: read per-species GeoTIFF files
// =====================================================================
async function computeLocal(
  ring: number[][],
  minX: number, minY: number, maxX: number, maxY: number,
): Promise<ComputeResult> {
  const refImage = await getImage(SPECIES[0].file);
  const [originX, originY] = refImage.getOrigin();
  const [resX, resY] = refImage.getResolution();
  const imgWidth = refImage.getWidth();
  const imgHeight = refImage.getHeight();
  const nodata = refImage.getGDALNoData();

  const col0 = Math.floor((minX - originX) / resX);
  const col1 = Math.ceil((maxX - originX) / resX);
  const row0 = Math.floor((maxY - originY) / resY);
  const row1 = Math.ceil((minY - originY) / resY);

  const x0 = Math.max(0, Math.min(col0, imgWidth - 1));
  const x1 = Math.max(0, Math.min(col1, imgWidth));
  const y0 = Math.max(0, Math.min(row0, imgHeight - 1));
  const y1 = Math.max(0, Math.min(row1, imgHeight));

  const windowWidth = x1 - x0;
  const windowHeight = y1 - y0;

  if (windowWidth <= 0 || windowHeight <= 0) {
    return { values: [], insideCount: 0, source: 'local' };
  }

  const insideMask: boolean[] = new Array(windowWidth * windowHeight);
  let insideCount = 0;
  for (let row = 0; row < windowHeight; row++) {
    for (let col = 0; col < windowWidth; col++) {
      const px = originX + (x0 + col + 0.5) * resX;
      const py = originY + (y0 + row + 0.5) * resY;
      const inside = pointInPolygon(px, py, ring);
      insideMask[row * windowWidth + col] = inside;
      if (inside) insideCount++;
    }
  }

  if (insideCount === 0) {
    return { values: [], insideCount: 0, source: 'local' };
  }

  const window = [x0, y0, x1, y1] as [number, number, number, number];
  const results = await Promise.all(
    SPECIES.map(async (sp) => {
      try {
        const img = await getImage(sp.file);
        const rasters = await img.readRasters({ window });
        const data = rasters[0] as Int16Array | Uint16Array | Float32Array;
        let sum = 0, validCount = 0;
        for (let i = 0; i < insideMask.length; i++) {
          if (!insideMask[i]) continue;
          const val = data[i];
          if (nodata !== null && val === nodata) continue;
          if (val < 0) continue;
          sum += val;
          validCount++;
        }
        return { key: sp.key, namn: sp.namn, meanRaw: validCount > 0 ? sum / validCount : 0, pixelCount: validCount };
      } catch (e) {
        console.error(`[slu-geotiff] Error reading ${sp.file}: ${e}`);
        return { key: sp.key, namn: sp.namn, meanRaw: 0, pixelCount: 0 };
      }
    }),
  );

  return { values: results, insideCount, source: 'local' };
}

// =====================================================================
// Main handler
// =====================================================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ring: number[][] = body.ring;

    if (!ring || ring.length < 3) {
      return NextResponse.json(
        { error: 'ring must have at least 3 coordinate pairs in SWEREF99TM' },
        { status: 400 },
      );
    }

    // Log first coordinate for debugging (verify unique per request)
    console.log(`[slu-geotiff] Request: ${ring.length} vertices, first=(${ring[0][0].toFixed(0)},${ring[0][1].toFixed(0)})`);

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    let result: ComputeResult;

    if (hasLocalFiles()) {
      console.log('[slu-geotiff] Använder lokala GeoTIFF-filer');
      result = await computeLocal(ring, minX, minY, maxX, maxY);
    } else {
      // Remote: try computeStatisticsHistograms + pixelSize first,
      // fall back to exportImage if tile-level data is detected
      console.log('[slu-geotiff] Lokala filer saknas — försöker remote');
      try {
        result = await computeRemoteStats(ring, minX, minY, maxX, maxY);
      } catch (e1) {
        const msg1 = e1 instanceof Error ? e1.message : String(e1);
        console.warn(`[slu-geotiff] Strategy 1 (computeStats+pixelSize) misslyckades: ${msg1}`);
        try {
          result = await computeRemoteExport(ring, minX, minY, maxX, maxY);
        } catch (e2) {
          const msg2 = e2 instanceof Error ? e2.message : String(e2);
          console.error(`[slu-geotiff] Strategy 2 (exportImage) misslyckades: ${msg2}`);
          return NextResponse.json({ error: `Alla strategier misslyckades. 1: ${msg1}. 2: ${msg2}` }, { status: 500 });
        }
      }
    }

    console.log(
      `[slu-geotiff] Results (${result.source}): ${result.values.map((r) => `${r.key}=${r.meanRaw.toFixed(0)}`).join(', ')} (${result.insideCount} pixlar)`,
    );

    return NextResponse.json({
      values: result.values,
      insideCount: result.insideCount,
      source: result.source,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error(`[slu-geotiff] ERROR: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
