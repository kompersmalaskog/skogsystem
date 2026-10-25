import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/lonesystem/server';
import { kravRoll, ADMIN_ROLLER } from '@/lib/auth/server';
import { hamtaTradslagPerSortiment } from '@/lib/faktura/lasTradslag';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/faktura/tradslag?objekt=<id>&objekt=<id>…
 *
 * Volym per (sortiment, trädslag) för en VO-grupp. EGEN rutt, med flit: den
 * läser detalj_stock och detalj_stam, alltså tusentals rader per trakt, och
 * får aldrig ligga i vägen för /api/faktura/underlag som räknar priset.
 * Granskningen hämtar den först när arket öppnas.
 *
 * Skriver ingenting.
 */
export async function GET(req: NextRequest) {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;

  const objektIds = req.nextUrl.searchParams.getAll('objekt').filter(Boolean);
  if (!objektIds.length) {
    return NextResponse.json({ ok: false, meddelande: 'objekt krävs.' }, { status: 400 });
  }

  try {
    const sb = serverSupabase();
    const tradslag = await hamtaTradslagPerSortiment(sb as any, objektIds);
    return NextResponse.json({ ok: true, tradslag });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e?.message || String(e) }, { status: 500 });
  }
}
