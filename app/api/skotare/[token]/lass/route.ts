import { NextRequest, NextResponse } from 'next/server';
import { skotarLassNytt, skotarLassTaBort } from '@/lib/skotarlank/lassSkriv';
import { BESOK_RUBRIKER, ejKonfigurerad, tjanstKlient } from '@/lib/besok/tjanst';

// POST /api/skotare/<token>/lass — ny. DELETE ?id= — ta bort. ÖPPEN med länkens token; servern bestämmer objektet och tiden (lib/skotarlank/lassSkriv).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: { token: string } }): Promise<NextResponse> {
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  try {
    const s = await skotarLassNytt(sb, ctx.params.token, await req.json().catch(() => null));
    return NextResponse.json(s.body, { status: s.status, headers: BESOK_RUBRIKER });
  } catch (e) {
    console.error('[skotare] lass:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, fel: 'Kunde inte spara just nu' }, { status: 503, headers: BESOK_RUBRIKER });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: { token: string } }): Promise<NextResponse> {
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  try {
    const s = await skotarLassTaBort(sb, ctx.params.token, req.nextUrl.searchParams.get('id'));
    return NextResponse.json(s.body, { status: s.status, headers: BESOK_RUBRIKER });
  } catch {
    return NextResponse.json({ ok: false, fel: 'Kunde inte ta bort just nu' }, { status: 503, headers: BESOK_RUBRIKER });
  }
}
