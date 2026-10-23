// Läs en trakts stämplingslängd — den som Vidas import redan sparat (objekt.stamplingslangd_url i bucketen kartbilder).
//
//   POST { objektId }  → kopierar PDF:en till stämplingsrapporternas bucket och skapar en rapportrad med objekt_id satt
//                         (status uppladdad). Svarar { ok, id, finns }. Själva läsningen är samma som vid uppladdning:
//                         webbläsaren anropar /api/stampling/rapport/[id]/las efteråt.
//                         Finns redan en läst rapport för trakten skapas ingen ny (finns: true) — en läsning kostar.
//
// Inloggad krävs, och samma kostnadsvakt som uppladdningen (MAX_LASNINGAR_PER_TIMME per inloggad och timme).
// Kopian görs på servern: PDF:en (upp till ~8 MB) går aldrig genom en request-kropp.
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { kravInloggad } from '@/lib/auth/server';
import { adminKlient, BUCKET, MAX_LASNINGAR_PER_TIMME, TRAKT_BUCKET } from '@/lib/stampling/pdf/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const v = await kravInloggad();
  if (!v.ok) return v.res;
  const body = await req.json().catch(() => null) as { objektId?: unknown } | null;
  const objektId = typeof body?.objektId === 'string' ? body.objektId.trim() : '';
  if (!/^[0-9A-Za-z_-]{1,64}$/.test(objektId)) return NextResponse.json({ ok: false, error: 'Ogiltig trakt.' }, { status: 400 });

  const admin = adminKlient();

  // Redan läst? Då finns inget att göra (en ny läsning kostar och ger samma siffror).
  const { data: finns, error: e0 } = await admin.from('stamplings_rapport').select('id,status')
    .eq('objekt_id', objektId).in('status', ['stammer', 'avviker', 'lasning']).order('skapad', { ascending: false }).limit(1);
  if (e0) return NextResponse.json({ ok: false, error: e0.message }, { status: 500 });
  if (finns && finns.length > 0) return NextResponse.json({ ok: true, id: finns[0].id, finns: true });

  const { data: obj, error: e1 } = await admin.from('objekt').select('vo_nummer,namn,stamplingslangd_url')
    .eq('vo_nummer', objektId).limit(1).maybeSingle();
  if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 500 });
  const kalla = (obj as { stamplingslangd_url?: string | null } | null)?.stamplingslangd_url;
  if (!kalla) return NextResponse.json({ ok: false, error: 'Trakten har ingen stämplingslängd från Vida.' }, { status: 404 });

  const email = v.session.user!.email;
  const sedan = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from('stamplings_rapport').select('id', { count: 'exact', head: true }).eq('skapad_av', email).gte('skapad', sedan);
  if ((count ?? 0) >= MAX_LASNINGAR_PER_TIMME) {
    return NextResponse.json({ ok: false, error: `Du har läst ${count} rapporter den senaste timmen. Vänta en stund.` }, { status: 429 });
  }

  const { data: fil, error: e2 } = await admin.storage.from(TRAKT_BUCKET).download(kalla);
  if (e2 || !fil) return NextResponse.json({ ok: false, error: `Stämplingslängden gick inte att hämta: ${e2?.message ?? 'filen saknas'}` }, { status: 500 });

  const id = randomUUID();
  const path = `${id}/${randomUUID()}.pdf`;
  const { error: e3 } = await admin.storage.from(BUCKET).upload(path, fil, { contentType: 'application/pdf' });
  if (e3) return NextResponse.json({ ok: false, error: `Kunde inte kopiera stämplingslängden: ${e3.message}` }, { status: 500 });
  const { error: e4 } = await admin.from('stamplings_rapport').insert({
    id, skapad_av: email, filnamn: kalla, storage_path: path, status: 'uppladdad', objekt_id: objektId,
  });
  if (e4) return NextResponse.json({ ok: false, error: `Kunde inte spara rapporten: ${e4.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, id, finns: false });
}
