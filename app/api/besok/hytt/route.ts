// GET /api/besok/hytt?objekt=<uuid>&maskin=<maskin_id>[&test=1] — hyttens läsning av besöken. INLOGGAD (middleware kräver session; token-adresserna är de enda öppna), och servern
// kontrollerar att maskinen är kopplad till objektet (lib/besok/hyttserver). Läser med service-klienten; svaret har exakt de fält kortet visar.

import { NextRequest, NextResponse } from 'next/server';
import { kravInloggad } from '@/lib/auth/server';
import { hyttBesok } from '@/lib/besok/hyttserver';
import { BESOK_RUBRIKER, ejKonfigurerad, tillSvar, tjanstKlient } from '@/lib/besok/tjanst';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const vakt = await kravInloggad();
  if (!vakt.ok) return vakt.res;
  const sb = tjanstKlient();
  if (!sb) return ejKonfigurerad();
  const q = req.nextUrl.searchParams;
  try {
    return tillSvar(await hyttBesok(sb, vakt.session, { objekt: q.get('objekt'), maskin: q.get('maskin'), test: q.get('test') }));
  } catch (e) {
    console.error('[besok] hytt:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, fel: 'Kunde inte läsa just nu' }, { status: 503, headers: BESOK_RUBRIKER });
  }
}
