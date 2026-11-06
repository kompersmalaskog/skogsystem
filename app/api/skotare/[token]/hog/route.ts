import { NextRequest, NextResponse } from 'next/server';
import { skotarHogAngra, skotarHogMarkera } from '@/lib/skotarlank/hogSkriv';
import { BESOK_RUBRIKER, ejKonfigurerad, tjanstKlient } from '@/lib/besok/tjanst';

// POST /api/skotare/<token>/hog — markera en hög (eller en ritad ring) som tagen/kvar. DELETE ?id= — ångra en markering gjord via länken.
// ÖPPEN med länkens token; servern bestämmer objektet, tiden och att platsen ligger på trakten (lib/skotarlank/hogSkriv).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: { token: string } }): Promise<NextResponse> {
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  try {
    const s = await skotarHogMarkera(sb, ctx.params.token, await req.json().catch(() => null));
    return NextResponse.json(s.body, { status: s.status, headers: BESOK_RUBRIKER });
  } catch (e) {
    console.error('[skotare] hog:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, fel: 'Kunde inte spara just nu' }, { status: 503, headers: BESOK_RUBRIKER });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: { token: string } }): Promise<NextResponse> {
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  try {
    const s = await skotarHogAngra(sb, ctx.params.token, req.nextUrl.searchParams.get('id'));
    return NextResponse.json(s.body, { status: s.status, headers: BESOK_RUBRIKER });
  } catch {
    return NextResponse.json({ ok: false, fel: 'Kunde inte ångra just nu' }, { status: 503, headers: BESOK_RUBRIKER });
  }
}
