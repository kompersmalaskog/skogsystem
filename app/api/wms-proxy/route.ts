import { NextRequest, NextResponse } from 'next/server';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Layer ID → WMS base URL + layer name
const LAYER_MAP: Record<string, { baseUrl: string; layers: string }> = {
  sks_markfuktighet: {
    baseUrl: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/Markfuktighet_SLU_2_0/ImageServer/WMSServer',
    layers: 'Markfuktighet_SLU_2_0',
  },
  sks_virkesvolym: {
    baseUrl: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/SkogligaGrunddata_3_1/ImageServer/WMSServer',
    layers: 'SkogligaGrunddata_3_1',
  },
  sks_tradhojd: {
    baseUrl: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/Tradhojd_3_1/ImageServer/WMSServer',
    layers: 'Tradhojd_3_1',
  },
  sks_lutning: {
    baseUrl: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/Lutning_1_0/ImageServer/WMSServer',
    layers: 'Lutning_1_0',
  },
};

function authHeaders(): Record<string, string> {
  const user = process.env.SKS_WMS_USER;
  const pass = process.env.SKS_WMS_PASS;
  if (!user || !pass) throw new Error('Credentials not configured');
  return {
    Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
    'User-Agent': UA,
  };
}

function validateHost(url: string): URL {
  const parsed = new URL(url);
  if (parsed.hostname !== 'geodata.skogsstyrelsen.se') {
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

  if (layer) {
    // New approach: construct WMS URL server-side from layer ID + bbox
    const def = LAYER_MAP[layer];
    if (!def) return NextResponse.json({ error: `Unknown layer: ${layer}` }, { status: 400 });
    const bbox = params.get('bbox');
    const width = params.get('width') || '256';
    const height = params.get('height') || '256';
    if (!bbox) return NextResponse.json({ error: 'Missing bbox' }, { status: 400 });
    url = `${def.baseUrl}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=${encodeURIComponent(def.layers)}&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:4326&BBOX=${bbox}&WIDTH=${width}&HEIGHT=${height}`;
  } else {
    // Legacy: full URL passed as ?url= parameter
    const legacyUrl = params.get('url');
    if (!legacyUrl) return NextResponse.json({ error: 'Missing layer or url' }, { status: 400 });
    url = legacyUrl;
  }

  console.log(`[wms-proxy GET] ${url.substring(0, 120)}...`);

  try {
    validateHost(url);
  } catch {
    return NextResponse.json({ error: 'Invalid or disallowed url' }, { status: 403 });
  }

  try {
    const resp = await fetch(url, { headers: authHeaders() });
    if (!resp.ok) {
      console.error(`[wms-proxy GET] Upstream ${resp.status}`);
      return new NextResponse(`Upstream ${resp.status}`, { status: resp.status });
    }

    const body = await resp.arrayBuffer();
    return new NextResponse(body, {
      headers: {
        'Content-Type': resp.headers.get('content-type') || 'image/png',
        'Cache-Control': 'public, max-age=300',
      },
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
