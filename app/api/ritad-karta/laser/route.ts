import { NextRequest, NextResponse } from 'next/server';
import { fromArrayBuffer } from 'geotiff';
import { kravInloggad } from '@/lib/auth/server';
import { utsnittForRingar, rimligHojdDm, RUTA_M } from '@/lib/ritadKarta/skog';

// Ritad karta (steg 1): medelhöjd och skanningsdag ur Skogsstyrelsens Skogliga grunddata för trakten + 300 m runt.
// In:  { ringar: [lng, lat][][] }  (traktgränsens ringar)
// Ut:  { minX, maxY, bredd, hojd, rutaM, hojdDm: (dm | null)[], ar: number | null }   rad 0 = norr
//
// Banden i SkogligaGrunddata_3_1 (0-baserade, samma som lib/skoglig-berakning.ts): 1 = medelhöjd (dm), 7 = skanningsdag (UnixDay).
// Svarar tjänsten med höjder som inte kan vara höjder är det ett FEL (502), aldrig en karta.

const SGD = 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/SkogligaGrunddata_3_1/ImageServer/exportImage';
const BAND_HOJD = 1;
const BAND_DAG = 7;
const NODATA = -9999;
const TIDSGRANS_MS = 25_000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const maxDuration = 30;

const fel = (status: number, text: string) => NextResponse.json({ error: text }, { status });

export async function POST(req: NextRequest) {
  const vakt = await kravInloggad();
  if (!vakt.ok) return vakt.res;

  let ringar: [number, number][][];
  try {
    ringar = (await req.json())?.ringar;
    if (!Array.isArray(ringar) || ringar.length === 0 || ringar.length > 200) throw new Error();
    if (!ringar.every((r) => Array.isArray(r) && r.length > 2 && r.length < 20_000 && r.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))) throw new Error();
  } catch {
    return fel(400, 'Väntade { ringar: [lng, lat][][] }.');
  }

  const user = process.env.SKS_WMS_USER;
  const pass = process.env.SKS_WMS_PASS;
  if (!user || !pass) return fel(500, 'Inloggningen till Skogsstyrelsen saknas på servern.');

  const u = utsnittForRingar(ringar);
  if (!u) return fel(400, 'Trakten är för stor för att rita.');

  const params = new URLSearchParams({
    bbox: `${u.minX},${u.minY},${u.maxX},${u.maxY}`,
    bboxSR: '3006',
    imageSR: '3006',
    size: `${u.bredd},${u.hojd}`,
    format: 'tiff',
    pixelType: 'F32',
    bandIds: `${BAND_HOJD},${BAND_DAG}`,
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
      console.error(`[ritad-karta] Skogsstyrelsen ${resp.status} ${typ}: ${(await resp.text().catch(() => '')).slice(0, 300)}`);
      return fel(502, 'Skogsstyrelsen svarade inte med laserdata.');
    }
    buf = await resp.arrayBuffer();
  } catch (e) {
    console.error('[ritad-karta] hämtning:', e instanceof Error ? e.message : e);
    return fel(504, 'Skogsstyrelsen svarade inte i tid.');
  } finally {
    clearTimeout(timer);
  }

  try {
    const bild = await (await fromArrayBuffer(buf)).getImage();
    if (bild.getWidth() !== u.bredd || bild.getHeight() !== u.hojd || bild.getSamplesPerPixel() < 2) return fel(502, 'Laserdatan hade ett oväntat format.');
    const [hojd, dag] = (await bild.readRasters({ samples: [0, 1] })) as unknown as ArrayLike<number>[];
    const nodata = bild.getGDALNoData() ?? NODATA;
    const saknas = (v: number) => !Number.isFinite(v) || v < 0 || v === nodata;
    const hojdDm: (number | null)[] = Array.from({ length: hojd.length }, (_, i) => (saknas(hojd[i]) ? null : Math.round(hojd[i])));
    if (!hojdDm.every(rimligHojdDm)) {
      console.error('[ritad-karta] orimliga höjder — har banden bytt plats?', hojdDm.filter((v) => !rimligHojdDm(v)).slice(0, 5));
      return fel(502, 'Laserdatan hade ett oväntat format.');
    }
    // Skanningsåret: det vanligaste året bland rutorna med data.
    const ar = new Map<number, number>();
    for (let i = 0; i < dag.length; i++) {
      const d = dag[i];
      if (saknas(d) || d === 0) continue;
      const y = new Date(Math.round(d) * 86_400_000).getUTCFullYear();
      if (y >= 2008 && y <= 2100) ar.set(y, (ar.get(y) ?? 0) + 1);
    }
    const vanligast = [...ar.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return NextResponse.json({ minX: u.minX, maxY: u.maxY, bredd: u.bredd, hojd: u.hojd, rutaM: RUTA_M, hojdDm, ar: vanligast });
  } catch (e) {
    console.error('[ritad-karta] tolkning:', e instanceof Error ? e.message : e);
    return fel(502, 'Laserdatan gick inte att läsa.');
  }
}
