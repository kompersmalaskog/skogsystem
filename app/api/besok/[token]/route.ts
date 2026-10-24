import { NextRequest, NextResponse } from 'next/server';
import { publikVy } from '@/lib/besok/server';
import { BESOK_RUBRIKER, ejKonfigurerad, tillSvar, tjanstKlient } from '@/lib/besok/tjanst';

// GET /api/besok/<token> — ÖPPEN utan inloggning (middleware släpper igenom exakt den här adressen med en lång token). Läser via service-klienten och lämnar ut bara det besökssidan visar
// (lib/besok/server). ?besok=<id> = markägarens egen anmälan, med vilka maskiner som tryckt Uppfattat.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: { token: string } }): Promise<NextResponse> {
  const { token } = ctx.params;
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  try {
    return tillSvar(await publikVy(sb, token, { besokId: req.nextUrl.searchParams.get('besok') }));
  } catch (e) {
    console.error('[besok] GET:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, fel: 'Kunde inte läsa just nu' }, { status: 503, headers: BESOK_RUBRIKER });
  }
}
