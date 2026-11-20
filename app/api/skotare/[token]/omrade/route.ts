import { NextResponse } from 'next/server';
import { skotarOmradeSvar } from '@/lib/skotarlank/hogSkriv';
import { BESOK_RUBRIKER, ejKonfigurerad, tjanstKlient } from '@/lib/besok/tjanst';

// POST /api/skotare/<token>/omrade — ÖPPEN med länkens token. Vad som ligger kvar i högarna inne i en ritad ring (lib/skotarlank/hogSkriv).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: { token: string } }): Promise<NextResponse> {
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  try {
    const s = await skotarOmradeSvar(sb, ctx.params.token, await req.json().catch(() => null));
    return NextResponse.json(s.body, { status: s.status, headers: BESOK_RUBRIKER });
  } catch (e) {
    console.error('[skotare] omrade:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, fel: 'Kunde inte läsa just nu' }, { status: 503, headers: BESOK_RUBRIKER });
  }
}
