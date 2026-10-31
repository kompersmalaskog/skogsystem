import { NextRequest, NextResponse } from 'next/server';
import { fromArrayBuffer } from 'geotiff';
import sharp from 'sharp';
import { kravInloggad } from '@/lib/auth/server';
import { utsnittForRingar } from '@/lib/ritadKarta/skog';
import { LUTNING_SAKNAS, MARK_RUTA_M, markUtsnitt, tillBase64, tolkaFuktBand } from '@/lib/ritadKarta/mark';

// Ritad — blött, brant och terrängskuggning för samma utsnitt som skogen (trakten + 300 m). Se lib/ritadKarta/mark.ts.
// In:  { ringar: [lng, lat][][] }
// Ut:  { minX, maxY, bredd, hojd, rutaM, fukt: base64 (FuktKod per ruta), lutning: base64 (grader, 255 = saknas),
//        skugga: data-URL (gråskala, norr upp, täcker utsnittet) | null, fel: string[] }
// Varje del kan falla för sig: det som inte gick att hämta är null/tomt och står i `fel` — aldrig en gissning.

const MARKFUKT = 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/Markfuktighet_SLU_2_0/ImageServer';
const LUTNING = 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/Lutning_1_0/ImageServer';
const LM_SKUGGA = 'https://minkarta.lantmateriet.se/map/hojdmodell/wms/v1.3';
const NONE_RULE = JSON.stringify({ rasterFunction: 'None' });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TIDSGRANS_MS = 20_000;
/** Skuggningens bild: högst så här många pixlar på längsta sidan. */
const SKUGGA_MAX_PX = 1600;
/** Kontrasthöjning på skuggningen. */
const SKUGGA_KONTRAST = 1.4;

export const maxDuration = 30;

const fel = (status: number, text: string) => NextResponse.json({ error: text }, { status });

async function hamta(url: string, headers: Record<string, string>): Promise<Response> {
  const styr = new AbortController();
  const t = setTimeout(() => styr.abort(), TIDSGRANS_MS);
  try { return await fetch(url, { headers, signal: styr.signal }); } finally { clearTimeout(t); }
}

type U = { minX: number; minY: number; maxX: number; maxY: number; bredd: number; hojd: number };

/** Banden ur en ArcGIS ImageServer som tiff, på jämna rutor över utsnittet. */
async function exportBand(service: string, u: U, auth: Record<string, string>, extra: Record<string, string> = {}): Promise<ArrayLike<number>[]> {
  const params = new URLSearchParams({
    bbox: `${u.minX},${u.minY},${u.maxX},${u.maxY}`, bboxSR: '3006', imageSR: '3006', size: `${u.bredd},${u.hojd}`,
    format: 'tiff', interpolation: 'RSP_NearestNeighbor', renderingRule: NONE_RULE, f: 'image', ...extra,
  });
  const r = await hamta(`${service}/exportImage?${params}`, auth);
  const typ = r.headers.get('content-type') ?? '';
  if (!r.ok || !typ.includes('tif')) throw new Error(`svar ${r.status}: ${(await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 80) || typ}`);
  const bild = await (await fromArrayBuffer(await r.arrayBuffer())).getImage();
  if (bild.getWidth() !== u.bredd || bild.getHeight() !== u.hojd) throw new Error('fel storlek');
  return (await bild.readRasters()) as unknown as ArrayLike<number>[];
}

/** Markfuktighet per ruta ur SLU:s råa band (lib/ritadKarta/mark.ts `tolkaFuktBand`). */
async function fukt(u: U, auth: Record<string, string>): Promise<{ koder: Uint8Array; fordelning: string }> {
  const t = tolkaFuktBand(await exportBand(MARKFUKT, u, auth));
  const antal = [0, 0, 0];
  for (const k of t.koder) antal[k]++;
  return { koder: t.koder, fordelning: `${t.kalla}; ${t.info}; rutor ingen/fuktig/blöt ${antal.join('/')}` };
}

/** Lantmäteriets terrängskuggning över utsnittet (EPSG:3006). Axelordningen prövas åt båda hållen; en enfärgad bild räknas som miss. */
async function skugga(u: U): Promise<string | null> {
  const sx = u.maxX - u.minX, sy = u.maxY - u.minY;
  const f = SKUGGA_MAX_PX / Math.max(sx, sy);
  const w = Math.max(1, Math.round(sx * f)), h = Math.max(1, Math.round(sy * f));
  for (const bbox of [`${u.minY},${u.minX},${u.maxY},${u.maxX}`, `${u.minX},${u.minY},${u.maxX},${u.maxY}`]) {
    const params = new URLSearchParams({
      SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: 'terrangskuggning', STYLES: '', CRS: 'EPSG:3006',
      BBOX: bbox, WIDTH: String(w), HEIGHT: String(h), FORMAT: 'image/png', TRANSPARENT: 'false',
    });
    const r = await hamta(`${LM_SKUGGA}?${params}`, { 'User-Agent': UA });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('image')) continue;
    const png = Buffer.from(await r.arrayBuffer());
    const st = await sharp(png).stats();
    if ((st.channels[0]?.stdev ?? 0) < 2) continue;
    // Platt mark ska vara neutral (128) i soft-light: medelvärdet flyttas till mitten och kontrasten höjs lite, så bara backarna syns.
    const medel = st.channels[0]?.mean ?? 128;
    const gra = await sharp(png).greyscale().linear(SKUGGA_KONTRAST, 128 - SKUGGA_KONTRAST * medel).png().toBuffer();
    return `data:image/png;base64,${gra.toString('base64')}`;
  }
  return null;
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
  const user = process.env.SKS_WMS_USER, pass = process.env.SKS_WMS_PASS;
  if (!user || !pass) return fel(500, 'Inloggningen till Skogsstyrelsen saknas på servern.');
  const auth = { Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'), 'User-Agent': UA };

  const s = utsnittForRingar(ringar);
  if (!s) return fel(400, 'Trakten är för stor för att rita.');
  const m = markUtsnitt(s);
  const u: U = { minX: s.minX, minY: s.minY, maxX: s.maxX, maxY: s.maxY, bredd: m.bredd, hojd: m.hojd };
  const n = m.bredd * m.hojd;
  const problem: string[] = [];

  const [fuktSvar, lutSvar, skuggSvar] = await Promise.allSettled([fukt(u, auth), exportBand(LUTNING, u, auth), skugga(u)]);

  let fuktKoder = new Uint8Array(n);
  let fuktFel: string | null = null;
  if (fuktSvar.status === 'fulfilled') { fuktKoder = fuktSvar.value.koder as typeof fuktKoder; console.log('[ritad-karta/mark] markfuktighet:', fuktSvar.value.fordelning); }
  else { console.error('[ritad-karta/mark] markfuktighet:', fuktSvar.reason); problem.push('markfuktighet'); fuktFel = String((fuktSvar.reason as any)?.message ?? fuktSvar.reason).slice(0, 120); }

  const lutning = new Uint8Array(n).fill(LUTNING_SAKNAS);
  if (lutSvar.status === 'fulfilled') {
    const v = lutSvar.value[0];
    for (let i = 0; i < n; i++) { const g = v[i]; if (Number.isFinite(g) && g >= 0 && g <= 90) lutning[i] = Math.round(g); }
  } else {
    console.error('[ritad-karta/mark] lutning:', lutSvar.reason);
    problem.push('lutning');
  }

  let skuggaUrl: string | null = null;
  if (skuggSvar.status === 'fulfilled' && skuggSvar.value) skuggaUrl = skuggSvar.value;
  else { console.error('[ritad-karta/mark] skuggning:', skuggSvar.status === 'rejected' ? skuggSvar.reason : 'tom bild'); problem.push('skuggning'); }

  return NextResponse.json({
    minX: m.minX, maxY: m.maxY, bredd: m.bredd, hojd: m.hojd, rutaM: MARK_RUTA_M,
    fukt: tillBase64(fuktKoder), lutning: tillBase64(lutning), skugga: skuggaUrl, fel: problem, fuktFel,
  });
}
