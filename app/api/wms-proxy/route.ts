import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = ['geodata.skogsstyrelsen.se'];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

  let parsed: URL;
  try { parsed = new URL(url); } catch { return NextResponse.json({ error: 'Invalid url' }, { status: 400 }); }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
  }

  const user = process.env.SKS_WMS_USER;
  const pass = process.env.SKS_WMS_PASS;
  if (!user || !pass) return NextResponse.json({ error: 'Credentials not configured' }, { status: 500 });

  try {
    const resp = await fetch(url, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
        'User-Agent': 'Mozilla/5.0 (Skogsystem WMS Proxy)',
      },
    });
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
