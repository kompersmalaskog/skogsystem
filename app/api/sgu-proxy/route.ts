import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

  let parsed: URL;
  try { parsed = new URL(url); } catch { return NextResponse.json({ error: 'Invalid url' }, { status: 400 }); }

  if (parsed.hostname !== 'resource.sgu.se') {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
  }

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Skogsystem SGU Proxy)' },
    });
    if (!resp.ok) return new NextResponse(`Upstream ${resp.status}`, { status: resp.status });
    const body = await resp.arrayBuffer();
    return new NextResponse(body, {
      headers: {
        'Content-Type': resp.headers.get('content-type') || 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Proxy failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
