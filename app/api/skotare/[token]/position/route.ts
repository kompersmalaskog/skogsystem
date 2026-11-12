import { NextResponse } from 'next/server';
import { skotarPositionHamta, skotarPositionSpara } from '@/lib/skotarlank/position';
import { BESOK_RUBRIKER, ejKonfigurerad, tjanstKlient } from '@/lib/besok/tjanst';

// POST /api/skotare/<token>/position — telefonen skickar sin position. GET — maskindatorn hämtar den senaste. ÖPPEN med länkens token;
// servern bestämmer objektet och tiden (lib/skotarlank/position).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: { token: string } }): Promise<NextResponse> {
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  try {
    const s = await skotarPositionHamta(sb, ctx.params.token);
    return NextResponse.json(s.body, { status: s.status, headers: BESOK_RUBRIKER });
  } catch {
    return NextResponse.json({ ok: false, fel: 'Kunde inte läsa just nu' }, { status: 503, headers: BESOK_RUBRIKER });
  }
}

export async function POST(req: Request, ctx: { params: { token: string } }): Promise<NextResponse> {
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  try {
    const s = await skotarPositionSpara(sb, ctx.params.token, await req.json().catch(() => null));
    return NextResponse.json(s.body, { status: s.status, headers: BESOK_RUBRIKER });
  } catch (e) {
    console.error('[skotare] position:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, fel: 'Kunde inte skicka just nu' }, { status: 503, headers: BESOK_RUBRIKER });
  }
}
