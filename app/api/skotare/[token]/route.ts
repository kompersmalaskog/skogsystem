import { NextRequest, NextResponse } from 'next/server';
import { skotarVySvar } from '@/lib/skotarlank/server';
import { BESOK_RUBRIKER, ejKonfigurerad, tjanstKlient } from '@/lib/besok/tjanst';

// GET /api/skotare/<token> — ÖPPEN utan inloggning (middleware släpper igenom exakt den här adressen med en lång token). Läser via service-klienten och lämnar ut
// bara det skotarsidan visar, för länkens objekt (lib/skotarlank/server).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: { token: string } }): Promise<NextResponse> {
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  try {
    const s = await skotarVySvar(sb, ctx.params.token, Date.now(), req.nextUrl.searchParams.get('farsk') === '1');
    return NextResponse.json(s.body, { status: s.status, headers: BESOK_RUBRIKER });
  } catch (e) {
    console.error('[skotare] GET:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, fel: 'Kunde inte läsa just nu' }, { status: 503, headers: BESOK_RUBRIKER });
  }
}
