// POST /api/besok/hytt/kvittera — "Uppfattat" från en maskin i hytten. INLOGGAD. Servern avgör maskin, roll, förare och testläge (lib/besok/hyttserver); klienten skickar bara
// vilket besök och vilken maskin. Tiden sätts av databasen.

import { NextRequest, NextResponse } from 'next/server';
import { kravInloggad } from '@/lib/auth/server';
import { kvitteraBesok } from '@/lib/besok/hyttserver';
import { BESOK_RUBRIKER, ejKonfigurerad, tillSvar, tjanstKlient } from '@/lib/besok/tjanst';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const vakt = await kravInloggad();
  if (!vakt.ok) return vakt.res;
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  const body = await req.json().catch(() => null);
  try {
    return tillSvar(await kvitteraBesok(sb, vakt.session, body));
  } catch (e) {
    console.error('[besok] hytt:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, fel: 'Kunde inte läsa just nu' }, { status: 503, headers: BESOK_RUBRIKER });
  }
}
