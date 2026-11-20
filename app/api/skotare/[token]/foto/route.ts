import { NextRequest, NextResponse } from 'next/server';
import { skotarFoto } from '@/lib/skotarlank/server';
import { BESOK_RUBRIKER, ejKonfigurerad, tjanstKlient } from '@/lib/besok/tjanst';

// GET /api/skotare/<token>/foto?id=<markering> — fotot på en av planerarens markeringar i länkens objekt. Markeringen slås upp i objektet; klienten kan aldrig
// ange en sökväg. Foto i Storage → kort signerad adress (10 min); äldre inbäddat foto → bilden direkt.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: { token: string } }): Promise<NextResponse> {
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  try {
    const f = await skotarFoto(sb, ctx.params.token, req.nextUrl.searchParams.get('id'));
    if (f.typ === 'url') return NextResponse.redirect(f.url, { status: 302, headers: BESOK_RUBRIKER });
    if (f.typ === 'data') return new NextResponse(f.bytes as unknown as BodyInit, { status: 200, headers: { ...BESOK_RUBRIKER, 'Content-Type': f.mime } });
    return NextResponse.json({ ok: false }, { status: f.status, headers: BESOK_RUBRIKER });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: BESOK_RUBRIKER });
  }
}
