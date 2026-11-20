// Proxy för SMHI:s punktprognos (SNOW1gv1) — reservväg för webbläsaren om SMHI inte svarar direkt (nätfel/CORS). Returnerar SMHI:s svar oförändrat;
// tolkningen sker i lib/smhi-prognos.ts. Ingen inloggning: samma öppna data som webbläsaren annars hämtar själv.
import { NextRequest, NextResponse } from 'next/server';
import { snow1gUrl } from '@/lib/smhi-prognos';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') || '');
  const lon = parseFloat(req.nextUrl.searchParams.get('lon') || '');
  // SMHI:s prognosgrid täcker Norden; allt annat är ett fel hos den som anropar.
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 50 || lat > 72 || lon < 0 || lon > 35) return NextResponse.json({ error: 'Missing or invalid lat/lon' }, { status: 400 });
  try {
    const r = await fetch(snow1gUrl(lat, lon), { cache: 'no-store' });
    if (!r.ok) return NextResponse.json({ error: `SMHI ${r.status}` }, { status: 502 });
    return NextResponse.json(await r.json(), { headers: { 'Cache-Control': 'public, max-age=600' } });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'SMHI error' }, { status: 502 });
  }
}
