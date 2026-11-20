import { NextRequest, NextResponse } from 'next/server';
import { markeraGatt } from '@/lib/besok/server';
import { BESOK_RUBRIKER, ejKonfigurerad, tillSvar, tjanstKlient } from '@/lib/besok/tjanst';

// POST /api/besok/<token>/gatt — markägarens "Jag har gått härifrån". Öppen utan inloggning; bara token-länken ger åtkomst. Tar { id } (anmälans id).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: { token: string } }): Promise<NextResponse> {
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  try {
    return tillSvar(await markeraGatt(sb, ctx.params.token, body));
  } catch (e) {
    console.error('[besok] gått:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, fel: 'Kunde inte spara just nu' }, { status: 503, headers: BESOK_RUBRIKER });
  }
}
