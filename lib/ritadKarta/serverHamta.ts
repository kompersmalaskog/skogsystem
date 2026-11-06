// Ritad — hämtningen på servern, EN gång för appens rutter (app/api/ritad-karta/*, kräver inloggning) och skotarlänken
// (app/api/skotare/<token>/ritad, området räknas av servern ur länkens trakt). Flyttad oförändrad ur de fyra rutterna 2026-11-06.
// Varje funktion tar traktens ringar ([lng, lat][]) och ger { status, body, headers? } — rutten gör bara svaret av det.

import { fromArrayBuffer } from 'geotiff';
import sharp from 'sharp';
import { adminSupabase } from '@/lib/auth/admin';
import { utsnittForRingar, rimligHojdDm, RUTA_M } from './skog';
import { LUTNING_SAKNAS, MARK_RUTA_M, markUtsnitt, tillBase64, tolkaFuktBand } from './mark';
import { VAG_MAX_LANKAR, nvdbTillVagar, vagBox } from './vagar';
import { DIKE_MARGINAL_M, DIKE_MAX, raderTillDiken, rutaArgument } from './diken';

export type RitadSvar = { status: number; body: unknown; headers?: Record<string, string> };
export type Ringar = [number, number][][];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const fel = (status: number, text: string): RitadSvar => ({ status, body: { error: text } });

/** Ringarna laser och mark tar emot (samma kontroll som förut). */
export function giltigaRingar(v: unknown): v is Ringar {
  return Array.isArray(v) && v.length > 0 && v.length <= 200
    && v.every((r) => Array.isArray(r) && r.length > 2 && r.length < 20_000 && r.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)));
}

// ---- Laser: medelhöjd och skanningsdag ----------------------------------------------------------------------------------------------------
// Medelhöjd och skanningsdag ur Skogsstyrelsens Skogliga grunddata för trakten + 300 m runt.
// Ut:  { minX, maxY, bredd, hojd, rutaM, hojdDm: (dm | null)[], ar: number | null }   rad 0 = norr
// Banden i SkogligaGrunddata_3_1 (0-baserade, samma som lib/skoglig-berakning.ts): 1 = medelhöjd (dm), 7 = skanningsdag (UnixDay).
// Svarar tjänsten med höjder som inte kan vara höjder är det ett FEL (502), aldrig en karta.

const SGD = 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/SkogligaGrunddata_3_1/ImageServer/exportImage';
const BAND_HOJD = 1;
const BAND_DAG = 7;
const NODATA = -9999;
const LASER_TIDSGRANS_MS = 25_000;

export async function hamtaLaser(ringar: Ringar): Promise<RitadSvar> {
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
  const timer = setTimeout(() => styr.abort(), LASER_TIDSGRANS_MS);
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
    return { status: 200, body: { minX: u.minX, maxY: u.maxY, bredd: u.bredd, hojd: u.hojd, rutaM: RUTA_M, hojdDm, ar: vanligast } };
  } catch (e) {
    console.error('[ritad-karta] tolkning:', e instanceof Error ? e.message : e);
    return fel(502, 'Laserdatan gick inte att läsa.');
  }
}

// ---- Mark: blött, brant och terrängskuggning ------------------------------------------------------------------------------------------------
// Samma utsnitt som skogen (trakten + 300 m). Se lib/ritadKarta/mark.ts.
// Ut:  { minX, maxY, bredd, hojd, rutaM, fukt: base64 (FuktKod per ruta), lutning: base64 (grader, 255 = saknas),
//        skugga: data-URL (gråskala, norr upp, täcker utsnittet) | null, fel: string[] }
// Varje del kan falla för sig: det som inte gick att hämta är null/tomt och står i `fel` — aldrig en gissning.

const MARKFUKT = 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/Markfuktighet_SLU_2_0/ImageServer';
const LUTNING = 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/Lutning_1_0/ImageServer';
const LM_SKUGGA = 'https://minkarta.lantmateriet.se/map/hojdmodell/wms/v1.3';
const NONE_RULE = JSON.stringify({ rasterFunction: 'None' });
const MARK_TIDSGRANS_MS = 20_000;
/** Skuggningens bild: högst så här många pixlar på längsta sidan. */
const SKUGGA_MAX_PX = 1600;
/** Kontrasthöjning på skuggningen. */
const SKUGGA_KONTRAST = 1.4;

async function hamtaMedGrans(url: string, headers: Record<string, string>): Promise<Response> {
  const styr = new AbortController();
  const t = setTimeout(() => styr.abort(), MARK_TIDSGRANS_MS);
  try { return await fetch(url, { headers, signal: styr.signal }); } finally { clearTimeout(t); }
}

type U = { minX: number; minY: number; maxX: number; maxY: number; bredd: number; hojd: number };

/** Banden ur en ArcGIS ImageServer som tiff, på jämna rutor över utsnittet. */
async function exportBand(service: string, u: U, auth: Record<string, string>, extra: Record<string, string> = {}): Promise<ArrayLike<number>[]> {
  const params = new URLSearchParams({
    bbox: `${u.minX},${u.minY},${u.maxX},${u.maxY}`, bboxSR: '3006', imageSR: '3006', size: `${u.bredd},${u.hojd}`,
    format: 'tiff', interpolation: 'RSP_NearestNeighbor', renderingRule: NONE_RULE, f: 'image', ...extra,
  });
  const r = await hamtaMedGrans(`${service}/exportImage?${params}`, auth);
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
    const r = await hamtaMedGrans(`${LM_SKUGGA}?${params}`, { 'User-Agent': UA });
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

export async function hamtaMark(ringar: Ringar): Promise<RitadSvar> {
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

  return {
    status: 200,
    body: { minX: m.minX, maxY: m.maxY, bredd: m.bredd, hojd: m.hojd, rutaM: MARK_RUTA_M, fukt: tillBase64(fuktKoder), lutning: tillBase64(lutning), skugga: skuggaUrl, fel: problem, fuktFel },
  };
}

// ---- Vägar: Trafikverkets NVDB --------------------------------------------------------------------------------------------------------------
// Hela vägnätet, också enskilda vägar och skogsbilvägar. Se lib/ritadKarta/vagar.ts.
// Ut:  GeoJSON FeatureCollection, varje väg med { k: 'stor' | 'skog' }.  Fel: { error } — inga gissade vägar.
// Nyckeln (TRAFIKVERKET_API_KEY) är serverns, samma som TMA-vägdatan (lib/nvdb.ts).

const NVDB = 'https://api.trafikinfo.trafikverket.se/v2/data.json';
const NAMESPACE = 'vägdata.nvdb_dk_o';
const OBJEKTTYP = 'FunktionellVägklass';
const VAG_SIDA = 1000;
const VAG_TIDSGRANS_MS = 20_000;

export async function hamtaVagar(ringar: unknown[]): Promise<RitadSvar> {
  const box = vagBox(ringar as never);
  if (!box) return fel(400, 'Fel indata');
  const nyckel = process.env.TRAFIKVERKET_API_KEY;
  if (!nyckel) return fel(503, 'Vägarna från Trafikverket är inte aktiverade');

  const rader: unknown[] = [];
  for (let skip = 0; skip < VAG_MAX_LANKAR; skip += VAG_SIDA) {
    const xml =
      `<REQUEST><LOGIN authenticationkey="${nyckel}"/>` +
      `<QUERY objecttype="${OBJEKTTYP}" namespace="${NAMESPACE}" schemaversion="1" limit="${VAG_SIDA}" skip="${skip}">` +
      `<FILTER><WITHIN name="Geometry.WKT-WGS84-3D" shape="box" value="${box.minLon} ${box.minLat}, ${box.maxLon} ${box.maxLat}"/></FILTER>` +
      `</QUERY></REQUEST>`;
    const styr = new AbortController();
    const t = setTimeout(() => styr.abort(), VAG_TIDSGRANS_MS);
    let sida: unknown[];
    try {
      const r = await fetch(NVDB, { method: 'POST', body: xml, headers: { 'Content-Type': 'text/xml' }, signal: styr.signal });
      if (!r.ok) return fel(502, `Trafikverket svarade ${r.status}`);
      const j: any = await r.json();
      const res = j?.RESPONSE?.RESULT?.[0];
      if (res?.ERROR) return fel(502, `Trafikverket: ${String(res.ERROR.MESSAGE ?? 'fel').slice(0, 120)}`);
      sida = Array.isArray(res?.[OBJEKTTYP]) ? res[OBJEKTTYP] : [];
    } catch {
      return fel(502, 'Kunde inte hämta vägarna från Trafikverket');
    } finally {
      clearTimeout(t);
    }
    rader.push(...sida);
    if (sida.length < VAG_SIDA) break;
  }
  return { status: 200, body: nvdbTillVagar(rader), headers: { 'Cache-Control': 'private, max-age=3600' } };
}

// ---- Diken: Naturvårdsverkets dikeskarta (tabellen `dike`) ---------------------------------------------------------------------------------
// Ut:  GeoJSON FeatureCollection, varje dike med { s: sort }. Vägdiken är bortplockade. Fel: { error }.

const DIKE_SIDA = 1000;

export async function hamtaDiken(ringar: unknown[]): Promise<RitadSvar> {
  const box = vagBox(ringar as never, DIKE_MARGINAL_M);
  if (!box) return fel(400, 'Fel indata');

  const sb = adminSupabase();
  // Rutans index (dike_i_ruta, migration 20261103150307): ett filter på fyra kolumner läste hela tabellen (9,5 s). Sidor på id (efter).
  const rader: { id: number; typ: unknown; coords: unknown }[] = [];
  let efter = 0;
  while (rader.length < DIKE_MAX) {
    const { data, error } = await sb.rpc('dike_i_ruta', { ...rutaArgument(box), p_efter: efter, p_antal: DIKE_SIDA });
    if (error) return fel(502, 'Kunde inte läsa dikena');
    const sida = (data ?? []) as { id: number; typ: unknown; coords: unknown }[];
    rader.push(...sida);
    if (sida.length < DIKE_SIDA) break;
    efter = sida[sida.length - 1].id;
  }
  return { status: 200, body: raderTillDiken(rader), headers: { 'Cache-Control': 'private, max-age=3600' } };
}
