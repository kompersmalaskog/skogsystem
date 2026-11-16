import { NextRequest, NextResponse } from 'next/server';
import { skotarLassTaBort } from '@/lib/skotarlank/lassSkriv';
import { BESOK_RUBRIKER, ejKonfigurerad, tjanstKlient } from '@/lib/besok/tjanst';

// DELETE /api/skotare/<token>/lass?id= — ta bort ett lass (och markeringarna det skapades av). Lass skapas bara via /taget. ÖPPEN med länkens token; servern bestämmer objektet och tiden (lib/skotarlank/lassSkriv).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
