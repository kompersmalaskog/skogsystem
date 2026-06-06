import { NextRequest, NextResponse } from 'next/server';

// Server-side-proxy för förarvyns/översiktens baskarta (Lantmäteriet öppna
// "Topografi Visning, vector tiles", CC-BY). Injicerar API-nyckeln HÄR — den
// läses bara från process.env (server-side) och når ALDRIG klienten. Stilen
// (app/oversikt/forarkarta-stil.ts) pekar enbart på den här routen.
//
// Konfig via env (sätts i Vercel — aldrig i repo/klient):
//   LM_VECTOR_API_KEY        (obligatorisk) — nyckel från Lantmäteriets API-portal
//   LM_VECTOR_TILE_TEMPLATE  (valfri)       — exakt upstream-tile-URL för din
//                                             prenumeration. {z}/{y}/{x} fylls i;
//                                             {key} byts mot nyckeln om den finns
//                                             i mallen (annars skickas nyckeln som
//                                             header Ocp-Apim-Subscription-Key +
//                                             ?api-key=).
//   LM_VECTOR_GLYPH_TEMPLATE (valfri)       — upstream-glyph-URL ({fontstack}/{range})
//
// Defaults nedan är en BÄSTA-GISSNING på den officiella öppna endpointen (per
// analogi med raster `topowebb-ccby`). Bekräfta exakt host/path mot din
// prenumeration och sätt LM_VECTOR_TILE_TEMPLATE om den skiljer.

const UA = 'skogsystem-forarkarta/1.0';

const TILE_TEMPLATE =
  process.env.LM_VECTOR_TILE_TEMPLATE ||
  'https://api.lantmateriet.se/open/topografi-ccby/v1/wmts/1.0.0/topografi/default/3857/{z}/{y}/{x}.mvt';
const GLYPH_TEMPLATE =
  process.env.LM_VECTOR_GLYPH_TEMPLATE ||
  'https://api.lantmateriet.se/open/topografi-ccby/v1/fonts/{fontstack}/{range}.pbf';
const API_KEY = process.env.LM_VECTOR_API_KEY || '';

// Tillåtna upstream-hostar härleds från mallarna (förhindrar SSRF via env-fel).
const ALLOWED_HOSTS: Set<string> = (() => {
  const hosts = new Set<string>(['api.lantmateriet.se']);
  for (const t of [TILE_TEMPLATE, GLYPH_TEMPLATE]) {
    try { hosts.add(new URL(t.replace(/\{[^}]+\}/g, '0')).hostname); } catch { /* ignore */ }
  }
  return hosts;
})();

const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map<string, { body: ArrayBuffer; ct: string; ts: number }>();

function getCached(k: string): { body: ArrayBuffer; ct: string } | null {
  const e = cache.get(k);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) { cache.delete(k); return null; }
  return { body: e.body, ct: e.ct };
}
function setCached(k: string, body: ArrayBuffer, ct: string): void {
  if (cache.size > 3000) {
    const old = Array.from(cache.entries()).sort((a, b) => a[1].ts - b[1].ts).slice(0, 800);
    for (const [kk] of old) cache.delete(kk);
  }
  cache.set(k, { body, ct, ts: Date.now() });
}

function fill(template: string, subs: Record<string, string>): string {
  let url = template;
  for (const [k, v] of Object.entries(subs)) url = url.split('{' + k + '}').join(v);
  if (template.indexOf('{key}') !== -1) {
    url = url.split('{key}').join(encodeURIComponent(API_KEY));
  } else if (API_KEY) {
    url += (url.indexOf('?') !== -1 ? '&' : '?') + 'api-key=' + encodeURIComponent(API_KEY);
  }
  return url;
}

async function proxy(upstreamUrl: string, cacheKey: string, defaultCt: string): Promise<NextResponse> {
  const cached = getCached(cacheKey);
  if (cached) {
    return new NextResponse(cached.body, {
      headers: { 'Content-Type': cached.ct, 'Cache-Control': 'public, max-age=600', 'X-Cache': 'HIT' },
    });
  }
  let host: string;
  try { host = new URL(upstreamUrl).hostname; } catch { return NextResponse.json({ error: 'bad upstream url' }, { status: 400 }); }
  if (!ALLOWED_HOSTS.has(host)) return NextResponse.json({ error: 'upstream host not allowed' }, { status: 403 });

  const headers: Record<string, string> = { 'User-Agent': UA };
  // Azure API Management-standard (apimanager.lantmateriet.se). Skadar inte om
  // upstream istället vill ha nyckeln i query (skickas också av fill()).
  if (API_KEY) headers['Ocp-Apim-Subscription-Key'] = API_KEY;

  try {
    const resp = await fetch(upstreamUrl, { headers });
    if (!resp.ok) {
      console.error(`[forarkarta] upstream ${resp.status}: ${host}`);
      return new NextResponse(`Upstream ${resp.status}`, { status: resp.status });
    }
    const body = await resp.arrayBuffer();
    const ct = resp.headers.get('content-type') || defaultCt;
    setCached(cacheKey, body, ct);
    return new NextResponse(body, {
      headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=600', 'X-Cache': 'MISS' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'proxy failed';
    console.error(`[forarkarta] ERROR: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const p = req.nextUrl.searchParams;
  const kind = p.get('kind');

  // Ingen nyckel → degradera tyst (kartan visar bara den ljusa bakgrunden,
  // markörer + rutt funkar). Sätt LM_VECTOR_API_KEY i Vercel för att aktivera.
  if (!API_KEY) return new NextResponse('LM_VECTOR_API_KEY ej konfigurerad', { status: 503 });

  if (kind === 'tile') {
    const z = p.get('z'), x = p.get('x'), y = p.get('y');
    if (!z || !x || !y || !/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+$/.test(y)) {
      return NextResponse.json({ error: 'bad tile coords' }, { status: 400 });
    }
    // WMTS-ordning: .../3857/{z}/{y}/{x}.mvt
    return proxy(fill(TILE_TEMPLATE, { z, x, y }), `t:${z}/${x}/${y}`, 'application/x-protobuf');
  }

  if (kind === 'glyph') {
    const fontstack = p.get('fontstack'), range = p.get('range');
    if (!fontstack || !range || !/^\d+-\d+$/.test(range)) {
      return NextResponse.json({ error: 'bad glyph req' }, { status: 400 });
    }
    return proxy(fill(GLYPH_TEMPLATE, { fontstack: encodeURIComponent(fontstack), range }), `g:${fontstack}:${range}`, 'application/x-protobuf');
  }

  return NextResponse.json({ error: 'unknown kind' }, { status: 400 });
}
