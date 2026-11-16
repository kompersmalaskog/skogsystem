import { NextResponse } from 'next/server';
import { skotarTaget } from '@/lib/skotarlank/hogSkriv';
import { BESOK_RUBRIKER, ejKonfigurerad, tjanstKlient } from '@/lib/besok/tjanst';

// POST /api/skotare/<token>/taget — det han tagit (en hög eller ett ritat område) och vart det gick. Servern räknar volymen ur högarna och
// skriver markeringarna + ett lass på avlägget. ÖPPEN med länkens token; servern bestämmer objektet, tiden och volymen (lib/skotarlank/hogSkriv).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: { token: string } }): Promise<NextResponse> {
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  try {
    const s = await skotarTaget(sb, ctx.params.token, await req.json().catch(() => null));
    return NextResponse.json(s.body, { status: s.status, headers: BESOK_RUBRIKER });
  } catch (e) {
    console.error('[skotare] taget:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, fel: 'Kunde inte spara just nu' }, { status: 503, headers: BESOK_RUBRIKER });
  }
}
