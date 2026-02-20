import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = ['geodata.skogsstyrelsen.se'];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    throw new Error('Host not allowed');
  }
  return parsed;
}

// GET — pass-through proxy (images, simple requests)
// URL is extracted from raw query string because WMS URLs contain & params
// that would be split by searchParams if not encoded.
export async function GET(req: NextRequest) {
  const search = req.nextUrl.search; // e.g. ?url=https://geodata...&BBOX=...
  const prefix = '?url=';
  const url = search?.startsWith(prefix) ? search.substring(prefix.length) : null;
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

  try {
    validateHost(url);
  } catch {
    return NextResponse.json({ error: 'Invalid or disallowed url' }, { status: 403 });
  }

  try {
    const resp = await fetch(url, { headers: authHeaders() });
    if (!resp.ok) return new NextResponse(`Upstream ${resp.status}`, { status: resp.status });

    const body = await resp.arrayBuffer();
    return new NextResponse(body, {
      headers: {
        'Content-Type': resp.headers.get('content-type') || 'image/png',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Proxy failed';
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
