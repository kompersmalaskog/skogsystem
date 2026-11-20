import { NextRequest, NextResponse } from 'next/server';
import { GET as forarkarta } from '@/app/api/forarkarta/route';
import { lankGiltig } from '@/lib/besok/server';
import { BESOK_RUBRIKER, ejKonfigurerad, tjanstKlient } from '@/lib/besok/tjanst';

// GET /api/besok/<token>/karta?z=&x=&y= — flygfotorutor till besökssidans karta. Samma proxy som appens egen baskarta (/api/forarkarta, ortofoto), men bakom besökslänken:
// en giltig, aktiv token krävs, och bara ortofoto-rutor lämnas ut. Utan det vore baskartan öppen för vem som helst.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: { token: string } }): Promise<NextResponse> {
  const { token } = ctx.params;
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  const p = req.nextUrl.searchParams;
  const [z, x, y] = [p.get('z'), p.get('x'), p.get('y')];
  if (![z, x, y].every((v) => /^\d{1,7}$/.test(v ?? '')) || Number(z) < 8 || Number(z) > 18) return NextResponse.json({ ok: false }, { status: 400, headers: BESOK_RUBRIKER });
  if (!(await lankGiltig(sb, token))) return NextResponse.json({ ok: false }, { status: 404, headers: BESOK_RUBRIKER });
  const url = new URL(req.url);
  url.pathname = '/api/forarkarta';
  url.search = `?layer=ortofoto&z=${z}&x=${x}&y=${y}`;
  const res = await forarkarta(new NextRequest(url));
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}
