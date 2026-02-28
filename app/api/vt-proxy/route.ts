import { NextRequest, NextResponse } from 'next/server';

const BASE_URL = 'https://maps.lantmateriet.se/vt/fastighetsindelning/v1/wmts/1.0.0/fastighetsindelning/default/3857';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// In-memory tile cache (10 min TTL)
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map<string, { data: ArrayBuffer; ts: number }>();

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const z = params.get('z');
  const x = params.get('x');
  const y = params.get('y');

  if (!z || !x || !y) {
    return NextResponse.json({ error: 'Missing z/x/y' }, { status: 400 });
  }

  const cacheKey = `${z}/${x}/${y}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return new NextResponse(cached.data, {
      headers: {
        'Content-Type': 'application/vnd.mapbox-vector-tile',
        'Cache-Control': 'public, max-age=600',
        'Access-Control-Allow-Origin': '*',
        'X-Cache': 'HIT',
      },
    });
  }

  // LM uses {z}/{y}/{x} order
  const url = `${BASE_URL}/${z}/${y}/${x}.mvt`;

  // Try with system credentials first, then user credentials, then no auth
  const authOptions = [
    { user: process.env.LM_SYSTEM_USER, pass: process.env.LM_SYSTEM_PASS },
    { user: process.env.LM_USERNAME, pass: process.env.LM_PASSWORD },
    { user: undefined, pass: undefined },
  ];

  for (const auth of authOptions) {
    try {
      const headers: Record<string, string> = { 'User-Agent': UA };
      if (auth.user && auth.pass) {
        headers['Authorization'] = 'Basic ' + Buffer.from(`${auth.user}:${auth.pass}`).toString('base64');
      }

      const resp = await fetch(url, { headers });
      if (resp.ok) {
        const data = await resp.arrayBuffer();

        // Limit cache size
        if (cache.size > 500) {
          const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 200);
          for (const [k] of oldest) cache.delete(k);
        }
        cache.set(cacheKey, { data, ts: Date.now() });

        console.log(`[vt-proxy] OK ${z}/${x}/${y} (${data.byteLength}b, auth=${auth.user || 'none'})`);
        return new NextResponse(data, {
          headers: {
            'Content-Type': 'application/vnd.mapbox-vector-tile',
            'Cache-Control': 'public, max-age=600',
            'Access-Control-Allow-Origin': '*',
            'X-Cache': 'MISS',
          },
        });
      }

      // If 401/403, try next auth option
      if (resp.status === 401 || resp.status === 403) continue;

      // Other error — stop trying
      console.error(`[vt-proxy] Upstream ${resp.status} for ${z}/${x}/${y}`);
      return new NextResponse(`Upstream ${resp.status}`, { status: resp.status });
    } catch (e) {
      console.error(`[vt-proxy] Fetch error for ${z}/${x}/${y}:`, e);
      continue;
    }
  }

  return new NextResponse('All auth methods failed', { status: 502 });
}
