// Läs en uppladdad stämplingsrapport med Claude (dokument → JSON) och kontrollera den med vanlig kod.
//
// AI:n LÄSER bara. Kontrollen (lib/stampling/pdf/kontroll.ts) summerar de inlästa raderna och jämför mot rapportens
// egna tryckta summor, på antal OCH volym m3sk per trädslag. Stämmer allt → status 'stammer'. Annars 'avviker' med
// ÅTGÄRD BEHÖVS, och användaren rättar rader i appen. Läsningen sparas orörd i `las`.
//
// En läsning kan ta en minut för en inskannad rapport — därför maxDuration 300.
import { NextResponse } from 'next/server';
import { kravInloggad } from '@/lib/auth/server';
import { LasFel, lasStamplingsrapport } from '@/lib/stampling/pdf/las';
import { kontrollera } from '@/lib/stampling/pdf/kontroll';
import { adminKlient, arUuid, BUCKET, sammanfatta, tillSvar, type RapportRad } from '@/lib/stampling/pdf/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const v = await kravInloggad();
  if (!v.ok) return v.res;
  if (!arUuid(params.id)) return NextResponse.json({ ok: false, error: 'Ogiltigt id.' }, { status: 400 });
  const admin = adminKlient();
  const { data, error } = await admin.from('stamplings_rapport').select('*').eq('id', params.id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const rad = data as RapportRad | null;
  if (!rad) return NextResponse.json({ ok: false, error: 'Rapporten finns inte.' }, { status: 404 });
  if (rad.status === 'lasning') return NextResponse.json({ ok: false, error: 'Rapporten läses redan.' }, { status: 409 });
  if (rad.las && rad.status !== 'fel') return NextResponse.json({ ok: true, rapport: tillSvar(rad) });   // redan läst: ingen ny betald läsning

  await admin.from('stamplings_rapport').update({ status: 'lasning', fel: null, uppdaterad: new Date().toISOString() }).eq('id', params.id);
  const misslyckad = async (kod: string, text: string, status: number) => {
    await admin.from('stamplings_rapport').update({ status: 'fel', fel: text, uppdaterad: new Date().toISOString() }).eq('id', params.id);
    return NextResponse.json({ ok: false, kod, error: text }, { status });
  };

  const { data: fil, error: e1 } = await admin.storage.from(BUCKET).download(rad.storage_path);
  if (e1 || !fil) return misslyckad('fil', `Filen gick inte att hämta ur lagringen: ${e1?.message ?? 'okänt fel'}. Ladda upp den igen.`, 500);

  try {
    const svar = await lasStamplingsrapport(new Uint8Array(await fil.arrayBuffer()));
    const kontroll = kontrollera(svar.lasning);
    const { data: ny, error: e2 } = await admin.from('stamplings_rapport')
      .update({ las: svar.lasning as unknown, modell: svar.modell, ...sammanfatta(svar.lasning, kontroll), fel: null })
      .eq('id', params.id).select('*').single();
    if (e2) return misslyckad('spara', `Läsningen lyckades men gick inte att spara: ${e2.message}`, 500);
    return NextResponse.json({ ok: true, rapport: tillSvar(ny as RapportRad), varningar: svar.varningar, tokens: svar.tokens });
  } catch (e: any) {
    if (e instanceof LasFel) {
      const status = e.kod === 'ingen_nyckel' ? 503 : e.kod === 'for_stor' || e.kod === 'inte_pdf' ? 422 : 502;
      return misslyckad(e.kod, e.message, status);
    }
    return misslyckad('okant', `Läsningen misslyckades: ${e?.message ?? String(e)}`, 500);
  }
}
