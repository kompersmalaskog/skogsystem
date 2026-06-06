import { NextRequest, NextResponse } from 'next/server';

// Server-side-proxy för förarvyns/översiktens baskarta.
//
// Hämtar Lantmäteriets NYCKELLÖSA, publika minkarta-WMS (lagret
// `topowebbkartan_nedtonad`) — samma tjänst (utan lösenord) som planeringsvyns
// LM-overlays redan använder. INGEN API-nyckel krävs. Proxyn ger caching +
// host-validering och håller upstream-URL:en server-side (städat).
//
// minkarta är Lantmäteriets konsument-endpoint ("Min karta") — samma ToS-
// gråzon som planeringen redan lever i. Skarp/sanktionerad väg = den keyade
// vektor-produkten (framtida uppgradering).

const UA = 'skogsystem-forarkarta/1.0';

// Verifierat med GetMap → HTTP 200 image/png, utan auth (VERSION 1.3.0, CRS 3857).
const LM_WMS = 'https://minkarta.lantmateriet.se/map/topowebb/wms/v1.3';
const LM_LAYER = 'topowebbkartan_nedtonad';
const ALLOWED_HOST = 'minkarta.lantmateriet.se';

// Baskartan ändras sällan → längre TTL.
const CACHE_TTL = 30 * 60 * 1000;
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const p = req.nextUrl.searchParams;
  const bbox = p.get('bbox');
  const w = p.get('w') || '256';
  const h = p.get('h') || '256';

  // MapLibre {bbox-epsg-3857} → "minx,miny,maxx,maxy" (tal, minus, punkt, komma).
  if (!bbox || !/^[-\d.,]+$/.test(bbox)) return NextResponse.json({ error: 'bad bbox' }, { status: 400 });
  if (!/^\d+$/.test(w) || !/^\d+$/.test(h)) return NextResponse.json({ error: 'bad size' }, { status: 400 });

  const key = `${bbox}:${w}:${h}`;
  const cached = getCached(key);
  if (cached) {
    return new NextResponse(cached.body, {
      headers: { 'Content-Type': cached.ct, 'Cache-Control': 'public, max-age=1800', 'X-Cache': 'HIT' },
    });
  }

  // WMS 1.3.0 + CRS=EPSG:3857: projicerad CRS → axelordning easting,northing =
  // samma minx,miny,maxx,maxy som MapLibre ger. Ingen axel-flip behövs.
  const url =
    `${LM_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${LM_LAYER}` +
    `&STYLES=&FORMAT=image/png&CRS=EPSG:3857&BBOX=${encodeURIComponent(bbox)}&WIDTH=${w}&HEIGHT=${h}`;

  try {
    if (new URL(url).hostname !== ALLOWED_HOST) return NextResponse.json({ error: 'host not allowed' }, { status: 403 });
  } catch {
    return NextResponse.json({ error: 'bad upstream url' }, { status: 400 });
  }

  try {
    const resp = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!resp.ok) {
      console.error(`[forarkarta] upstream ${resp.status}`);
      return new NextResponse(`Upstream ${resp.status}`, { status: resp.status });
    }
    const body = await resp.arrayBuffer();
    const ct = resp.headers.get('content-type') || 'image/png';
    setCached(key, body, ct);
    return new NextResponse(body, {
      headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=1800', 'X-Cache': 'MISS' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'proxy failed';
    console.error(`[forarkarta] ERROR: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
