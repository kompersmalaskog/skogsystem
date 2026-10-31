import { NextRequest, NextResponse } from 'next/server';
import { fromUrl } from 'geotiff';
import sharp from 'sharp';
import proj4 from 'proj4';
import { kravInloggad } from '@/lib/auth/server';
import { SWEREF99TM, utsnittForRingar } from '@/lib/ritadKarta/skog';
import { HOJD_RUTA_M, SKUGGA_UTJAMNING, hojdkurvor, jamna, skuggaFlera, type Hojd } from '@/lib/ritadKarta/hojd';

// Ritad — höjdkurvor och skuggning från flera håll ur Lantmäteriets markhöjdmodell (1 m) för samma utsnitt som skogen. Se lib/ritadKarta/hojd.ts.
// In:  { ringar: [lng, lat][][] }
// Ut:  { kurvor: GeoJSON (linjer, s = 1 på stödkurvor), skugga: data-URL (gråskala, norr upp, platt = 128) } — eller { error } med orsaken.
//
// Höjddatan hämtas ur Lantmäteriets STAC-katalog (samma som scripts/build-terrain-tiles.py): sökningen är öppen, filerna kräver höjddatanyckeln
// (LM_SYSTEM_USER/LM_SYSTEM_PASS, annars LM_USERNAME/LM_PASSWORD). Filerna läses med HTTP-range (geotiff) — bara utsnittet, i HOJD_RUTA_M upplösning.
// Faller något är det ett fel med orsaken; kartan ritas ändå utan kurvor (aldrig gissade kurvor).

const STAC = 'https://api.lantmateriet.se/stac-hojd/v1/search';
const SAMLING = 'mhm-62_5';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TIDSGRANS_MS = 25_000;

export const maxDuration = 60;

const fel = (status: number, text: string) => NextResponse.json({ error: text }, { status });

function nyckel(): Record<string, string> | null {
  const user = process.env.LM_SYSTEM_USER || process.env.LM_USERNAME;
  const pass = process.env.LM_SYSTEM_PASS || process.env.LM_PASSWORD;
  if (!user || !pass) return null;
  return { Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'), 'User-Agent': UA };
}

async function medTidsgrans<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([p, new Promise<T>((_, nej) => { t = setTimeout(() => nej(new Error('tog för lång tid')), ms); })]); }
  finally { clearTimeout(t); }
}

type Ruta = { minX: number; minY: number; maxX: number; maxY: number };

/** Lägg en fils del av utsnittet i rutnätet. */
async function lasFil(href: string, auth: Record<string, string>, u: Ruta, h: Hojd) {
  const tiff = await fromUrl(href, { headers: auth, allowFullFile: true } as any);
  const bild = await tiff.getImage();
  const [bx0, by0, bx1, by1] = bild.getBoundingBox();
  const x0 = Math.max(u.minX, bx0), y0 = Math.max(u.minY, by0), x1 = Math.min(u.maxX, bx1), y1 = Math.min(u.maxY, by1);
  if (x1 - x0 < HOJD_RUTA_M || y1 - y0 < HOJD_RUTA_M) return 0;
  // Snäpp till rutnätet så filernas delar ligger kant i kant.
  const k0 = Math.ceil((x0 - h.minX) / h.rutaM), k1 = Math.floor((x1 - h.minX) / h.rutaM);
  const r0 = Math.ceil((h.maxY - y1) / h.rutaM), r1 = Math.floor((h.maxY - y0) / h.rutaM);
  const w = k1 - k0, hh = r1 - r0;
  if (w <= 0 || hh <= 0) return 0;
  const bbox = [h.minX + k0 * h.rutaM, h.maxY - r1 * h.rutaM, h.minX + k1 * h.rutaM, h.maxY - r0 * h.rutaM];
  const ras = (await tiff.readRasters({ bbox, width: w, height: hh, resampleMethod: 'bilinear', interleave: false } as any)) as any;
  const band: ArrayLike<number> = ras[0];
  const nodata = bild.getGDALNoData();
  let n = 0;
  for (let r = 0; r < hh; r++) for (let k = 0; k < w; k++) {
    const v = band[r * w + k];
    if (!Number.isFinite(v) || v === nodata || v < -100 || v > 2500) continue;
    h.z[(r0 + r) * h.bredd + (k0 + k)] = v;
    n++;
  }
  return n;
}

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
  const auth = nyckel();
  if (!auth) return fel(500, 'nyckeln till Lantmäteriets höjddata saknas på servern');
  const s = utsnittForRingar(ringar);
  if (!s) return fel(400, 'trakten är för stor');

  const bredd = Math.round((s.maxX - s.minX) / HOJD_RUTA_M), hojd = Math.round((s.maxY - s.minY) / HOJD_RUTA_M);
  const h: Hojd = { minX: s.minX, maxY: s.maxY, bredd, hojd, rutaM: HOJD_RUTA_M, z: new Float32Array(bredd * hojd).fill(NaN) };

  try {
    await medTidsgrans((async () => {
      const [lng0, lat0] = proj4(SWEREF99TM, 'EPSG:4326', [s.minX, s.minY]);
      const [lng1, lat1] = proj4(SWEREF99TM, 'EPSG:4326', [s.maxX, s.maxY]);
      const r = await fetch(`${STAC}?collections=${SAMLING}&bbox=${lng0},${lat0},${lng1},${lat1}&limit=50`, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`katalogen svarade ${r.status}`);
      const filer: string[] = ((await r.json())?.features ?? []).map((f: any) => f?.assets?.data?.href).filter((x: unknown) => typeof x === 'string');
      if (!filer.length) throw new Error('ingen höjddata för området');
      const n = (await Promise.all(filer.map((f) => lasFil(f, auth, s, h)))).reduce((a, b) => a + b, 0);
      if (n < h.z.length * 0.5) throw new Error('höjddatan täcker inte området');
    })(), TIDSGRANS_MS);
  } catch (e: any) {
    console.error('[ritad-karta/hojd]', e);
    return fel(502, String(e?.message ?? e).slice(0, 120));
  }

  const kurvor = hojdkurvor(h);
  const gra = skuggaFlera({ ...h, z: jamna(h.z, bredd, hojd, SKUGGA_UTJAMNING) });
  const png = await sharp(Buffer.from(gra.buffer, gra.byteOffset, gra.byteLength), { raw: { width: bredd, height: hojd, channels: 1 } }).png().toBuffer();
  return NextResponse.json({ kurvor, skugga: `data:image/png;base64,${png.toString('base64')}` });
}
