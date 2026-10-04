// Stämplingsrapporter: lista och starta en uppladdning. Inloggad krävs.
//
//   GET   → de senaste rapporterna (utan innehåll)
//   POST  → { filnamn } skapar en rad (status uppladdad) och en SIGNERAD uppladdnings-URL. Filen går direkt från
//           webbläsaren till bucketen: en PDF på 8 MB ryms inte i en Vercel-funktions request (4,5 MB).
//
// Läsningen sker i /api/stampling/rapport/[id]/las. Kostnadsvakt: högst MAX_LASNINGAR_PER_TIMME per inloggad och timme.
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { kravInloggad } from '@/lib/auth/server';
import { adminKlient, BUCKET, MAX_LASNINGAR_PER_TIMME, tillSvar, type RapportRad } from '@/lib/stampling/pdf/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const v = await kravInloggad();
  if (!v.ok) return v.res;
  const { data, error } = await adminKlient().from('stamplings_rapport').select('*').neq('status', 'uppladdad').order('skapad', { ascending: false }).limit(30);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rapporter: (data as RapportRad[]).map(r => tillSvar(r, false)) });
}

export async function POST(req: Request) {
  const v = await kravInloggad();
  if (!v.ok) return v.res;
  const body = await req.json().catch(() => null) as { filnamn?: unknown } | null;
  const filnamn = typeof body?.filnamn === 'string' ? body.filnamn.trim().slice(0, 200) : '';
  if (!filnamn || !/\.pdf$/i.test(filnamn)) return NextResponse.json({ ok: false, error: 'Välj en PDF-fil.' }, { status: 400 });

  const admin = adminKlient();
  const email = v.session.user!.email;
  const sedan = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from('stamplings_rapport').select('id', { count: 'exact', head: true }).eq('skapad_av', email).gte('skapad', sedan);
  if ((count ?? 0) >= MAX_LASNINGAR_PER_TIMME) {
    return NextResponse.json({ ok: false, error: `Du har läst ${count} rapporter den senaste timmen. Vänta en stund, eller mata in för hand.` }, { status: 429 });
  }

  const id = randomUUID();
  const path = `${id}/${randomUUID()}.pdf`;                       // aldrig användarens filnamn i sökvägen
  const { data: signed, error: e1 } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (e1 || !signed) return NextResponse.json({ ok: false, error: `Kunde inte förbereda uppladdningen: ${e1?.message ?? 'okänt fel'}` }, { status: 500 });
  const { error: e2 } = await admin.from('stamplings_rapport').insert({ id, skapad_av: email, filnamn, storage_path: path, status: 'uppladdad' });
  if (e2) return NextResponse.json({ ok: false, error: `Kunde inte spara rapporten: ${e2.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, id, path, token: signed.token });
}
