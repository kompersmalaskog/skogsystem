import { NextRequest, NextResponse } from 'next/server';

// Server-side-proxy för baskartan (förarvy/översikt + körvy/planering).
//
// TVÅ INGÅNGAR:
//  • ?bbox=... (WMS GetMap)      — översiktens/förarkartans befintliga anrop. Oförändrat.
//  • ?z=&x=&y= (tile z/x/y)      — körvyns/planeringsvyns baskarta. Väljer upstream via env:
//
// UPSTREAM för z/x/y-läget:
//  • DEFAULT (A, stopgap): Lantmäteriets NYCKELLÖSA minkarta-WMS (topowebbkartan_nedtonad).
//    Rutans EPSG:3857-bbox räknas ut ur z/x/y och skickas som WMS GetMap. Funkar idag,
//    ToS-gråzon ("Min karta"). Bevisad i drift (samma tjänst som förarkartan).
//  • SANKTIONERAD (B): sätt LM_OPEN_TOPO_TOKEN i miljön → proxyn byter till Lantmäteriets
//    ÖPPNA DATA-WMTS (topowebb-ccby, CC-BY, kommersiellt OK, EPSG:3857) UTAN kodändring.
//    Token ligger i URL:en, ingen Basic auth. LM_OPEN_TOPO_LAYER styr lager (default nedtonad).
//
// OBS: detta använder INTE LM_USERNAME/LM_SYSTEM_* — de nycklarna är för HÖJDDATA (1m DEM),
// en annan produkt. Att dra en baskarta på dem vore utanför avtalet.

const UA = 'skogsystem-baskarta/1.0';

// A — nyckellös minkarta (WMS). Verifierat: GetMap → 200 image/png utan auth (1.3.0, CRS 3857).
const LM_WMS = 'https://minkarta.lantmateriet.se/map/topowebb/wms/v1.3';
const LM_LAYER = 'topowebbkartan_nedtonad';
const MINKARTA_HOST = 'minkarta.lantmateriet.se';

// FLYGFOTO — LM ortofoto 0,5 m, samma nyckellösa minkarta. Esri World Imagery är BORTTAGEN
// (kommersiell användning kräver ArcGIS-licens). OBS: det finns INGEN öppna data-motsvarighet
// för ortofoto att flippa till — verifierat: api.lantmateriet.se/open/ortofoto-* svarar 404
// medan topowebb-ccby svarar. Sanktionerad väg för flygbild = beställa Ortofoto Visning
// (betald Geotorget-produkt). Tills dess ligger flygfotot i samma minkarta-gråzon som basen.
const LM_ORTO_WMS = 'https://minkarta.lantmateriet.se/map/ortofoto/wms/v1.3';
const LM_ORTO_LAYER = 'Ortofoto_0.5';

// B — öppna data-WMTS. Aktiveras när token finns i miljön (annars tom → A används).
const OPEN_TOKEN = process.env.LM_OPEN_TOPO_TOKEN || '';
const OPEN_LAYER = process.env.LM_OPEN_TOPO_LAYER || 'topowebb_nedtonad';
const OPEN_HOST = 'api.lantmateriet.se';

const ALLOWED_HOSTS = new Set([MINKARTA_HOST, OPEN_HOST]);

// Web Mercator halva jordomkretsen (EPSG:3857 gräns).
const R = 20037508.342789244;

// XYZ-ruta (z/x/y) → EPSG:3857-bbox "minx,miny,maxx,maxy" (WMS 1.3.0 projicerad CRS = easting,northing).
function tileBbox3857(z: number, x: number, y: number): string {
  const n = 2 ** z;
  const span = (2 * R) / n;
  const minx = -R + x * span;
  const maxx = minx + span;
  const maxy = R - y * span;
  const miny = maxy - span;
  return `${minx},${miny},${maxx},${maxy}`;
}

// Upstream-URL för en enskild ruta. Öppna data (WMTS) om token satt, annars minkarta (WMS).
function tileUpstreamUrl(z: number, x: number, y: number, orto: boolean): string {
  if (orto) {
    // Flygfoto går alltid via minkarta — ingen öppen data-ortofoto finns att flippa till.
    const b = tileBbox3857(z, x, y);
    return `${LM_ORTO_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${LM_ORTO_LAYER}` +
      `&STYLES=&FORMAT=image/png&CRS=EPSG:3857&BBOX=${encodeURIComponent(b)}&WIDTH=256&HEIGHT=256`;
  }
  if (OPEN_TOKEN) {
    // WMTS REST: .../{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol} = 3857/{z}/{y}/{x}.
    return `https://${OPEN_HOST}/open/topowebb-ccby/v1/wmts/token/${OPEN_TOKEN}/1.0.0/${OPEN_LAYER}/default/3857/${z}/${y}/${x}.png`;
  }
  const bbox = tileBbox3857(z, x, y);
  return `${LM_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${LM_LAYER}` +
    `&STYLES=&FORMAT=image/png&CRS=EPSG:3857&BBOX=${encodeURIComponent(bbox)}&WIDTH=256&HEIGHT=256`;
}

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

async function serveUpstream(url: string, cacheKey: string): Promise<NextResponse> {
  try {
    if (!ALLOWED_HOSTS.has(new URL(url).hostname)) {
      return NextResponse.json({ error: 'host not allowed' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'bad upstream url' }, { status: 400 });
  }
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!resp.ok) {
      console.error(`[baskarta] upstream ${resp.status}`);
      return new NextResponse(`Upstream ${resp.status}`, { status: resp.status });
    }
    const body = await resp.arrayBuffer();
    const ct = resp.headers.get('content-type') || 'image/png';
    setCached(cacheKey, body, ct);
    return new NextResponse(body, {
      headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=1800', 'X-Cache': 'MISS' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'proxy failed';
    console.error(`[baskarta] ERROR: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const p = req.nextUrl.searchParams;
  const z = p.get('z'), x = p.get('x'), y = p.get('y');

  // === z/x/y-läge (körvy/planering) — WMTS öppna data ELLER WMS minkarta via env ===
  if (z !== null || x !== null || y !== null) {
    if (!/^\d+$/.test(z || '') || !/^\d+$/.test(x || '') || !/^\d+$/.test(y || '')) {
      return NextResponse.json({ error: 'bad z/x/y' }, { status: 400 });
    }
    const orto = p.get('layer') === 'ortofoto';
    const cacheKey = `t:${orto ? 'orto' : OPEN_TOKEN ? 'o' : 'm'}:${z}/${x}/${y}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return new NextResponse(cached.body, {
        headers: { 'Content-Type': cached.ct, 'Cache-Control': 'public, max-age=1800', 'X-Cache': 'HIT' },
      });
    }
    return serveUpstream(tileUpstreamUrl(Number(z), Number(x), Number(y), orto), cacheKey);
  }

  // === bbox-läge (översikt/förarkarta) — oförändrat, nyckellös minkarta-WMS ===
  const bbox = p.get('bbox');
  const w = p.get('w') || '256';
  const h = p.get('h') || '256';
  if (!bbox || !/^[-\d.,]+$/.test(bbox)) return NextResponse.json({ error: 'bad bbox' }, { status: 400 });
  if (!/^\d+$/.test(w) || !/^\d+$/.test(h)) return NextResponse.json({ error: 'bad size' }, { status: 400 });

  const cacheKey = `b:${bbox}:${w}:${h}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return new NextResponse(cached.body, {
      headers: { 'Content-Type': cached.ct, 'Cache-Control': 'public, max-age=1800', 'X-Cache': 'HIT' },
    });
  }
  const url =
    `${LM_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${LM_LAYER}` +
    `&STYLES=&FORMAT=image/png&CRS=EPSG:3857&BBOX=${encodeURIComponent(bbox)}&WIDTH=${w}&HEIGHT=${h}`;
  return serveUpstream(url, cacheKey);
}
