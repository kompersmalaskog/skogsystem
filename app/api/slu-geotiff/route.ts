import { NextRequest, NextResponse } from 'next/server';
import { fromFile, fromUrl, GeoTIFF, GeoTIFFImage } from 'geotiff';
import path from 'path';
import fs from 'fs';

// --- Species definitions ---
// COG files on R2: one Cloud Optimized GeoTIFF per species (EPSG:3006, 12.5m pixel)
// geotiff.js reads only the tiles needed via HTTP range requests.
const SPECIES = [
  { key: 'tall', namn: 'Tall', file: 'SLUskogskarta_volTall.tif', cog: 'tall.tif' },
  { key: 'gran', namn: 'Gran', file: 'SLUskogskarta_volGran.tif', cog: 'gran.tif' },
  { key: 'bjork', namn: 'Björk', file: 'SLUskogskarta_volBjork.tif', cog: 'bjork.tif' },
  { key: 'contorta', namn: 'Contorta', file: 'SLUskogskarta_volContorta.tif', cog: 'contorta.tif' },
  { key: 'bok', namn: 'Bok', file: 'SLUskogskarta_volBok.tif', cog: 'bok.tif' },
  { key: 'ek', namn: 'Ek', file: 'SLUskogskarta_volEk.tif', cog: 'ek.tif' },
  { key: 'ovrigt', namn: 'Övrigt löv', file: 'SLUskogskarta_volOvrigtLov.tif', cog: 'ovrigt.tif' },
];

// R2 public bucket URL (set in Vercel env vars)
const COG_BASE_URL = process.env.SLU_COG_BASE_URL || '';

const DATA_DIR = path.join(process.cwd(), 'data', 'slu-skogskarta');

type SpeciesResult = { key: string; namn: string; meanRaw: number; pixelCount: number };
type ComputeResult = { values: SpeciesResult[]; insideCount: number; source: string };

// Module-level cache for open GeoTIFF handles
const localTiffCache = new Map<string, GeoTIFF>();
const localImageCache = new Map<string, GeoTIFFImage>();
const cogTiffCache = new Map<string, GeoTIFF>();
const cogImageCache = new Map<string, GeoTIFFImage>();

// Detect available data source (cached after first check)
let dataSource: 'local' | 'cog' | 'none' | null = null;
function detectSource(): 'local' | 'cog' | 'none' {
  if (dataSource !== null) return dataSource;
  try {
    const firstFile = path.join(DATA_DIR, SPECIES[0].file);
    if (fs.existsSync(firstFile)) {
      dataSource = 'local';
      console.log(`[slu-geotiff] Källa: lokala GeoTIFF (${DATA_DIR})`);
      return dataSource;
    }
  } catch { /* ignore */ }

  if (COG_BASE_URL) {
    dataSource = 'cog';
    console.log(`[slu-geotiff] Källa: COG via R2 (${COG_BASE_URL})`);
    return dataSource;
  }

  dataSource = 'none';
  console.warn('[slu-geotiff] Ingen datakälla: varken lokala filer eller SLU_COG_BASE_URL');
  return dataSource;
}

// --- Local file access ---
async function getLocalImage(filename: string): Promise<GeoTIFFImage> {
  let img = localImageCache.get(filename);
  if (img) return img;
  const filePath = path.join(DATA_DIR, filename);
  const tiff = await fromFile(filePath);
  localTiffCache.set(filename, tiff);
  img = await tiff.getImage();
  localImageCache.set(filename, img);
  return img;
}

// --- COG access via HTTP range requests ---
async function getCogImage(cogFile: string): Promise<GeoTIFFImage> {
  let img = cogImageCache.get(cogFile);
  if (img) return img;
  const url = `${COG_BASE_URL}/${cogFile}`;
  console.log(`[slu-geotiff] Opening COG: ${url}`);
  try {
    const tiff = await fromUrl(url);
    cogTiffCache.set(cogFile, tiff);
    img = await tiff.getImage();
    cogImageCache.set(cogFile, img);
    return img;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Kunde inte öppna COG ${url}: ${msg}`);
  }
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
// Compute species statistics within polygon
// Works identically for local files and COG — only the image source differs.
// =====================================================================
async function computeSpecies(
  ring: number[][],
  minX: number, minY: number, maxX: number, maxY: number,
  source: 'local' | 'cog',
): Promise<ComputeResult> {
  // Get reference image to determine grid parameters
  const refImage = source === 'local'
    ? await getLocalImage(SPECIES[0].file)
    : await getCogImage(SPECIES[0].cog);

  const [originX, originY] = refImage.getOrigin();
  const [resX, resY] = refImage.getResolution(); // resY is negative (north-up)
  const imgWidth = refImage.getWidth();
  const imgHeight = refImage.getHeight();
  const nodata = refImage.getGDALNoData() ?? -1;

  // Convert bbox to pixel coordinates
  const col0 = Math.floor((minX - originX) / resX);
  const col1 = Math.ceil((maxX - originX) / resX);
  const row0 = Math.floor((maxY - originY) / resY); // maxY → top row
  const row1 = Math.ceil((minY - originY) / resY);   // minY → bottom row

  const x0 = Math.max(0, Math.min(col0, imgWidth - 1));
  const x1 = Math.max(0, Math.min(col1, imgWidth));
  const y0 = Math.max(0, Math.min(row0, imgHeight - 1));
  const y1 = Math.max(0, Math.min(row1, imgHeight));

  const windowWidth = x1 - x0;
  const windowHeight = y1 - y0;

  console.log(`[slu-geotiff] Window: [${x0},${y0}]-[${x1},${y1}] = ${windowWidth}x${windowHeight}px`);

  if (windowWidth <= 0 || windowHeight <= 0) {
    return { values: [], insideCount: 0, source };
  }

  // Build polygon mask
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

  console.log(`[slu-geotiff] ${insideCount} of ${windowWidth * windowHeight} pixels inside polygon`);

  if (insideCount === 0) {
    return { values: [], insideCount: 0, source };
  }

  // Read each species in parallel
  // For COG: geotiff.js only fetches the tiles that overlap the window (HTTP range requests)
  const window = [x0, y0, x1, y1] as [number, number, number, number];
  const results = await Promise.all(
    SPECIES.map(async (sp) => {
      const img = source === 'local'
        ? await getLocalImage(sp.file)
        : await getCogImage(sp.cog);
      const rasters = await img.readRasters({ window });
      const data = rasters[0] as Int16Array | Uint16Array | Float32Array;

      let sum = 0, validCount = 0;
      for (let i = 0; i < insideMask.length; i++) {
        if (!insideMask[i]) continue;
        const val = data[i];
        if (val === nodata || val < 0) continue;
        sum += val;
        validCount++;
      }
      return { key: sp.key, namn: sp.namn, meanRaw: validCount > 0 ? sum / validCount : 0, pixelCount: validCount };
    }),
  );

  return { values: results, insideCount, source };
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

    console.log(`[slu-geotiff] Request: ${ring.length} vertices, first=(${ring[0][0].toFixed(0)},${ring[0][1].toFixed(0)})`);

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const source = detectSource();
    if (source === 'none') {
      return NextResponse.json(
        { error: 'SLU-data ej tillgänglig. Konfigurera SLU_COG_BASE_URL eller lägg lokala GeoTIFF-filer i data/slu-skogskarta/' },
        { status: 503 },
      );
    }

    const result = await computeSpecies(ring, minX, minY, maxX, maxY, source);

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

// =====================================================================
// GET /api/slu-geotiff — Diagnostic endpoint
// Returns status of data sources and tests R2 connectivity
// =====================================================================
export async function GET() {
  const results: Record<string, unknown> = {
    source: detectSource(),
    COG_BASE_URL: COG_BASE_URL || '(ej satt)',
    DATA_DIR,
  };

  // Check local files
  const localFiles: Record<string, boolean> = {};
  for (const sp of SPECIES) {
    const filePath = path.join(DATA_DIR, sp.file);
    localFiles[sp.file] = fs.existsSync(filePath);
  }
  results.localFiles = localFiles;

  // Check COG/R2 accessibility
  if (COG_BASE_URL) {
    const cogStatus: Record<string, string> = {};
    for (const sp of SPECIES) {
      const url = `${COG_BASE_URL}/${sp.cog}`;
      try {
        const resp = await fetch(url, { method: 'HEAD' });
        cogStatus[sp.cog] = `${resp.status} ${resp.statusText}`;
      } catch (e) {
        cogStatus[sp.cog] = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    results.cogFiles = cogStatus;

    // Also try original filenames in case they were uploaded without renaming
    const originalStatus: Record<string, string> = {};
    for (const sp of SPECIES) {
      const url = `${COG_BASE_URL}/${sp.file}`;
      try {
        const resp = await fetch(url, { method: 'HEAD' });
        originalStatus[sp.file] = `${resp.status} ${resp.statusText}`;
      } catch (e) {
        originalStatus[sp.file] = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    results.originalNameFiles = originalStatus;
  }

  return NextResponse.json(results, { status: 200 });
}
