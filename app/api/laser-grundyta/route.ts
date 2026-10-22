import { NextRequest, NextResponse } from 'next/server';
import { fromArrayBuffer } from 'geotiff';
import { tillSweref, utsnitt, slaUpp, RUTA_M } from '@/lib/laserGrundytaRutnat';
import { dagNummer, rimligRuta } from '@/lib/laserKvar';

// Grundyta och skanningsdag ur Skogsstyrelsens Skogliga grunddata för punkter i en gallrad trakt.
// In:  { punkter: [lng, lat][] }   (provpunkter var 10:e meter, lib/laserKvar.ts provpunkter)
// Ut:  { rutor: [grundyta | null, skanningsdag | null][] }   en per 10 m-ruta, i dagar sedan 1970
//
// Banden i SkogligaGrunddata_3_1: 2 = grundyta (m²/ha), 7 = skanningsdag (UnixDay) — samma ordning som
// lib/skoglig-berakning.ts har läst sedan volymberäkningen byggdes. Svarar tjänsten med värden som inte kan vara
// grundyta eller ett datum är det ett FEL (502), aldrig ett tal: då har banden bytt plats.
//
// Ett utsnitt per anrop (exportImage, GeoTIFF, F32, närmaste granne, på jämna 10 m — ingen omsampling).

const SGD = 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/SkogligaGrunddata_3_1/ImageServer/exportImage';
const BAND_GRUNDYTA = 2;
const BAND_DAG = 7;
const NODATA = -9999;
const MAX_PUNKTER = 40_000;
const TIDSGRANS_MS = 25_000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const maxDuration = 30;

function fel(status: number, text: string) {
  return NextResponse.json({ error: text }, { status });
}

export async function POST(req: NextRequest) {
  let punkter: [number, number][];
  try {
    const body = await req.json();
    punkter = body?.punkter;
    if (!Array.isArray(punkter) || punkter.length === 0 || punkter.length > MAX_PUNKTER) throw new Error();
    if (!punkter.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) throw new Error();
  } catch {
    return fel(400, 'Väntade { punkter: [lng, lat][] }.');
  }

  const user = process.env.SKS_WMS_USER;
  const pass = process.env.SKS_WMS_PASS;
  if (!user || !pass) return fel(500, 'Inloggningen till Skogsstyrelsen saknas på servern.');

  const xy = tillSweref(punkter);
  const u = utsnitt(xy);
  if (!u) return fel(400, 'Ytan är för stor.');

  const params = new URLSearchParams({
    bbox: `${u.minX},${u.minY},${u.maxX},${u.maxY}`,
    bboxSR: '3006',
    imageSR: '3006',
    size: `${u.bredd},${u.hojd}`,
    format: 'tiff',
    pixelType: 'F32',
    bandIds: `${BAND_GRUNDYTA},${BAND_DAG}`,
    interpolation: 'RSP_NearestNeighbor',
    noData: String(NODATA),
    noDataInterpretation: 'esriNoDataMatchAny',
    f: 'image',
  });

  const styr = new AbortController();
  const timer = setTimeout(() => styr.abort(), TIDSGRANS_MS);
  let buf: ArrayBuffer;
  try {
    const resp = await fetch(`${SGD}?${params}`, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'), 'User-Agent': UA },
      signal: styr.signal,
    });
    const typ = resp.headers.get('content-type') ?? '';
    if (!resp.ok || !typ.includes('tif')) {
      const text = (await resp.text().catch(() => '')).slice(0, 300);
      console.error(`[laser-grundyta] Skogsstyrelsen ${resp.status} ${typ}: ${text}`);
      return fel(502, 'Skogsstyrelsen svarade inte med laserdata.');
    }
    buf = await resp.arrayBuffer();
  } catch (e) {
    console.error('[laser-grundyta] hämtning:', e instanceof Error ? e.message : e);
    return fel(504, 'Skogsstyrelsen svarade inte i tid.');
  } finally {
    clearTimeout(timer);
  }

  try {
    const bild = await (await fromArrayBuffer(buf)).getImage();
    if (bild.getWidth() !== u.bredd || bild.getHeight() !== u.hojd || bild.getSamplesPerPixel() < 2) {
      console.error(`[laser-grundyta] oväntad bild ${bild.getWidth()}x${bild.getHeight()}x${bild.getSamplesPerPixel()}`);
      return fel(502, 'Laserdatan hade ett oväntat format.');
    }
    const band = (await bild.readRasters({ samples: [0, 1] })) as unknown as ArrayLike<number>[];
    const nodata = bild.getGDALNoData() ?? NODATA;
    const rutor = slaUpp(xy, u, band[0], band[1], nodata);
    const idag = dagNummer(new Date().toISOString());
    if (!rutor.every((r) => rimligRuta(r, idag))) {
      console.error('[laser-grundyta] orimliga värden — har banden bytt plats?', JSON.stringify(rutor.slice(0, 5)));
      return fel(502, 'Laserdatan hade ett oväntat format.');
    }
    return NextResponse.json({ rutaM: RUTA_M, rutor: rutor.map((r) => [r.g, r.dag]) });
  } catch (e) {
    console.error('[laser-grundyta] tolkning:', e instanceof Error ? e.message : e);
    return fel(502, 'Laserdatan gick inte att läsa.');
  }
}
