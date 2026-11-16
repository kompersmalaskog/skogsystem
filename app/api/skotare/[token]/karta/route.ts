import { NextRequest, NextResponse } from 'next/server';
import { GET as forarkarta } from '@/app/api/forarkarta/route';
import { skotarLankGiltig } from '@/lib/skotarlank/server';
import { BESOK_RUBRIKER, ejKonfigurerad, tjanstKlient } from '@/lib/besok/tjanst';

// GET /api/skotare/<token>/karta?lager=foto|karta&z=&x=&y= — bakgrundskartan till skotarsidan. Samma proxy som appens egen baskarta (/api/forarkarta),
// men bakom skotarlänken: en giltig, aktiv token krävs, och bara Flygfoto (ortofoto) och Karta (dämpad) lämnas ut.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: { token: string } }): Promise<NextResponse> {
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  const p = req.nextUrl.searchParams;
  const [z, x, y] = [p.get('z'), p.get('x'), p.get('y')];
  const lager = p.get('lager') === 'karta' ? 'karta' : 'foto';
  if (![z, x, y].every((v) => /^\d{1,7}$/.test(v ?? '')) || Number(z) < 6 || Number(z) > 18) return NextResponse.json({ ok: false }, { status: 400, headers: BESOK_RUBRIKER });
  if (!(await skotarLankGiltig(sb, ctx.params.token))) return NextResponse.json({ ok: false }, { status: 404, headers: BESOK_RUBRIKER });
  const url = new URL(req.url);
  url.pathname = '/api/forarkarta';
  url.search = lager === 'foto' ? `?layer=ortofoto&z=${z}&x=${x}&y=${y}` : `?z=${z}&x=${x}&y=${y}`;
  const res = await forarkarta(new NextRequest(url));
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}
