// Läs en trakts stämplingslängd — den som Vidas import redan sparat (objekt.stamplingslangd_url i bucketen kartbilder,
// eller en ensam inskannad PDF bland övriga dokument — lib/rotpost/kalla.ts).
//
//   POST { objektId }  → kopierar PDF:en till stämplingsrapporternas bucket och skapar en rapportrad med objekt_id satt
//                         (status uppladdad). Svarar { ok, id, finns }. Själva läsningen är samma som vid uppladdning:
//                         webbläsaren anropar /api/stampling/rapport/[id]/las efteråt.
//                         Finns redan en läst rapport för trakten skapas ingen ny (finns: true) — en läsning kostar.
//
// Inloggad krävs, och samma kostnadsvakt som uppladdningen (MAX_LASNINGAR_PER_TIMME per inloggad och timme).
// Kopian görs på servern: PDF:en (upp till ~8 MB) går aldrig genom en request-kropp.
import { NextResponse } from 'next/server';
import { kravInloggad } from '@/lib/auth/server';
import { skapaForObjekt } from '@/lib/stampling/pdf/franObjekt';
import { adminKlient, MAX_LASNINGAR_PER_TIMME } from '@/lib/stampling/pdf/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const v = await kravInloggad();
  if (!v.ok) return v.res;
  const body = await req.json().catch(() => null) as { objektId?: unknown } | null;
  const objektId = typeof body?.objektId === 'string' ? body.objektId.trim() : '';
  if (!/^[0-9A-Za-z_-]{1,64}$/.test(objektId)) return NextResponse.json({ ok: false, error: 'Ogiltig trakt.' }, { status: 400 });

  const admin = adminKlient();
  const email = v.session.user!.email;
  const sedan = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from('stamplings_rapport').select('id', { count: 'exact', head: true }).eq('skapad_av', email).gte('skapad', sedan);
  if ((count ?? 0) >= MAX_LASNINGAR_PER_TIMME) {
    return NextResponse.json({ ok: false, error: `Du har läst ${count} rapporter den senaste timmen. Vänta en stund.` }, { status: 429 });
  }
  const r = await skapaForObjekt(admin, objektId, email);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.v.id, finns: r.v.finns });
}
