import { NextRequest, NextResponse } from 'next/server';
import { skapaAnmalan } from '@/lib/besok/server';
import { BESOK_RUBRIKER, ejKonfigurerad, tillSvar, tjanstKlient } from '@/lib/besok/tjanst';

// POST /api/besok/<token>/anmal — markägarens "Jag kommer på besök". Öppen utan inloggning; bara token-länken ger åtkomst. Tar { namn, telefon, nar: 'nu'|'om1h'|'tid', tid? }.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: { token: string } }): Promise<NextResponse> {
  const { token } = ctx.params;
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  try {
    return tillSvar(await skapaAnmalan(sb, token, body));
  } catch (e) {
    console.error('[besok] POST:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, fel: 'Kunde inte spara just nu' }, { status: 503, headers: BESOK_RUBRIKER });
  }
}
