import { NextRequest, NextResponse } from 'next/server';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Layer ID → WMS config
const WMS_LAYERS: Record<string, { url: string; layers: string; auth?: boolean }> = {
  sks_markfuktighet: {
    url: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/Markfuktighet_SLU_2_0/ImageServer/WMSServer',
    layers: 'Markfuktighet_SLU_2_0',
    auth: true,
  },
  sks_virkesvolym: {
    url: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/SkogligaGrunddata_3_1/ImageServer/WMSServer',
    layers: 'SkogligaGrunddata_3_1',
    auth: true,
  },
  sks_tradhojd: {
    url: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/Tradhojd_3_1/ImageServer/WMSServer',
    layers: 'Tradhojd_3_1',
    auth: true,
  },
  sks_lutning: {
    url: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/Lutning_1_0/ImageServer/WMSServer',
    layers: 'Lutning_1_0',
    auth: true,
  },
  raa_lamningar: {
    url: 'https://pub.raa.se/visning/lamningar_v1/wms',
    layers: 'fornlamning',
  },
};

// In-memory tile cache (5 minute TTL)
const CACHE_TTL = 5 * 60 * 1000;
const tileCache = new Map<string, { data: ArrayBuffer; contentType: string; ts: number }>();

function getCached(key: string): { data: ArrayBuffer; contentType: string } | null {
  const entry = tileCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { tileCache.delete(key); return null; }
  return { data: entry.data, contentType: entry.contentType };
}

function setCache(key: string, data: ArrayBuffer, contentType: string) {
  // Limit cache size to ~200 MB (rough estimate: 200 entries * ~1MB max per tile is very generous)
  if (tileCache.size > 2000) {
    // Evict oldest entries
    const oldest = [...tileCache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 500);
    for (const [k] of oldest) tileCache.delete(k);
  }
  tileCache.set(key, { data, contentType, ts: Date.now() });
}

// Convert EPSG:3857 (Web Mercator) coordinates to EPSG:4326 (WGS84)
function mercatorToWgs84(x: number, y: number): [number, number] {
  const lon = (x / 20037508.34) * 180;
  let lat = (y / 20037508.34) * 180;
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
  return [lon, lat];
}

function authHeaders(): Record<string, string> {
  const user = process.env.SKS_WMS_USER;
  const pass = process.env.SKS_WMS_PASS;
  if (!user || !pass) throw new Error('Credentials not configured');
  return {
    Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
    'User-Agent': UA,
  };
}

const ALLOWED_HOSTS = ['geodata.skogsstyrelsen.se', 'pub.raa.se'];

function validateHost(url: string): URL {
  const parsed = new URL(url);
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    throw new Error('Host not allowed');
  }
  return parsed;
}

// GET — WMS tile proxy
// Accepts: ?layer=sks_markfuktighet&bbox=...&width=256&height=256
// Or legacy: ?url=<full encoded WMS URL>
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const layer = params.get('layer');
  let url: string;
  let needsAuth = true;
  let cacheKey = '';

  if (layer) {
    // Construct WMS URL server-side from layer ID + bbox
    const wmsConfig = WMS_LAYERS[layer];
    if (!wmsConfig) return NextResponse.json({ error: `Unknown layer: ${layer}` }, { status: 400 });
    const bbox = params.get('bbox');
    const width = params.get('width') || '256';
    const height = params.get('height') || '256';
    if (!bbox) return NextResponse.json({ error: 'Missing bbox' }, { status: 400 });
    // bbox arrives in EPSG:3857 from MapLibre, convert to EPSG:4326 for WMS
    const [minx, miny, maxx, maxy] = bbox.split(',').map(Number);
    const [minLon, minLat] = mercatorToWgs84(minx, miny);
    const [maxLon, maxLat] = mercatorToWgs84(maxx, maxy);
    const wgs84Bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
    url = `${wmsConfig.url}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=${wmsConfig.layers}&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:4326&BBOX=${wgs84Bbox}&WIDTH=${width}&HEIGHT=${height}`;
    console.log('[wms-proxy]', layer, wgs84Bbox);
    needsAuth = wmsConfig.auth === true;
    cacheKey = `${layer}:${bbox}:${width}:${height}`;
  } else {
    // Legacy: full URL passed as ?url= parameter
    const legacyUrl = params.get('url');
    if (!legacyUrl) return NextResponse.json({ error: 'Missing layer or url' }, { status: 400 });
    url = legacyUrl;
  }

  // Check cache
  if (cacheKey) {
    const cached = getCached(cacheKey);
    if (cached) {
      return new NextResponse(cached.data, {
        headers: { 'Content-Type': cached.contentType, 'Cache-Control': 'public, max-age=300', 'X-Cache': 'HIT' },
      });
    }
  }

  try {
    validateHost(url);
  } catch {
    return NextResponse.json({ error: 'Invalid or disallowed url' }, { status: 403 });
  }

  try {
    const headers: Record<string, string> = { 'User-Agent': UA };
    if (needsAuth) Object.assign(headers, authHeaders());
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error(`[wms-proxy GET] Upstream ${resp.status}: ${url.substring(0, 200)}`);
      console.error(`[wms-proxy GET] Response: ${text.substring(0, 300)}`);
      return new NextResponse(`Upstream ${resp.status}`, { status: resp.status });
    }

    const body = await resp.arrayBuffer();
    const contentType = resp.headers.get('content-type') || 'image/png';

    // Store in cache
    if (cacheKey) setCache(cacheKey, body, contentType);

    return new NextResponse(body, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=300', 'X-Cache': 'MISS' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Proxy failed';
    console.error(`[wms-proxy GET] ERROR: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// POST — forwards form-encoded body to upstream (for computeStatisticsHistograms etc.)
// Expects JSON: { targetUrl: string, body: string }
export async function POST(req: NextRequest) {
  let targetUrl: string;
  let formBody: string;
  try {
    const json = await req.json();
    targetUrl = json.targetUrl;
    formBody = json.body;
    if (!targetUrl || !formBody) throw new Error('missing fields');
  } catch {
    return NextResponse.json(
      { error: 'Expected JSON { targetUrl: string, body: string }' },
      { status: 400 },
    );
  }

  try {
    validateHost(targetUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid or disallowed url' }, { status: 403 });
  }

  try {
    const hdrs = authHeaders();
    hdrs['Content-Type'] = 'application/x-www-form-urlencoded';

    console.log(`[wms-proxy POST] ${targetUrl} body_length=${formBody.length}`);

    const resp = await fetch(targetUrl, {
      method: 'POST',
      headers: hdrs,
      body: formBody,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error(`[wms-proxy POST] Upstream ${resp.status}: ${text.slice(0, 300)}`);
      return new NextResponse(`Upstream ${resp.status}`, { status: resp.status });
    }

    const body = await resp.arrayBuffer();
    return new NextResponse(body, {
      headers: {
        'Content-Type': resp.headers.get('content-type') || 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Proxy POST failed';
    console.error(`[wms-proxy POST] ERROR: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
