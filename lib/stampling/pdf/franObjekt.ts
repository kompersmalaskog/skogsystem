// Stämplingslängder som redan ligger på trakten (Vidas import: objekt.stamplingslangd_url i bucketen kartbilder, eller en ensam
// inskannad PDF bland övriga dokument — lib/rotpost/kalla.ts). EN väg för knappen på traktsidan och för den automatiska läsningen:
//   skapaForObjekt  kopierar PDF:en till stämplingsrapporternas bucket och skapar rapportraden (objekt_id satt, status uppladdad)
//   lasRapport      läser en rapportrad med Claude och kontrollerar den (samma som /api/stampling/rapport/[id]/las)
// Ingen auth här — anroparen (rutten eller cron) har redan kontrollerat behörigheten.

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { stamplingsKalla } from '@/lib/rotpost/kalla';
import { LasFel, lasStamplingsrapport } from './las';
import { kontrollera } from './kontroll';
import { BUCKET, TRAKT_BUCKET, sammanfatta, type RapportRad } from './server';

export type Utfall<T> = { ok: true; v: T } | { ok: false; status: number; kod: string; error: string };

/** Skapar rapportraden för traktens stämplingslängd. Finns redan en läst (eller pågående) rapport skapas ingen ny. */
export async function skapaForObjekt(admin: SupabaseClient, objektId: string, skapadAv: string): Promise<Utfall<{ id: string; finns: boolean }>> {
  const { data: finns, error: e0 } = await admin.from('stamplings_rapport').select('id,status')
    .eq('objekt_id', objektId).in('status', ['stammer', 'avviker', 'lasning']).order('skapad', { ascending: false }).limit(1);
  if (e0) return { ok: false, status: 500, kod: 'las', error: e0.message };
  if (finns && finns.length > 0) return { ok: true, v: { id: String(finns[0].id), finns: true } };

  const { data: obj, error: e1 } = await admin.from('objekt').select('vo_nummer,stamplingslangd_url,ovriga_dokument')
    .eq('vo_nummer', objektId).limit(1).maybeSingle();
  if (e1) return { ok: false, status: 500, kod: 'las', error: e1.message };
  const kalla = obj ? stamplingsKalla(obj as Parameters<typeof stamplingsKalla>[0])?.path : null;
  if (!kalla) return { ok: false, status: 404, kod: 'saknas', error: 'Trakten har ingen stämplingslängd från Vida.' };

  const { data: fil, error: e2 } = await admin.storage.from(TRAKT_BUCKET).download(kalla);
  if (e2 || !fil) return { ok: false, status: 500, kod: 'fil', error: `Stämplingslängden gick inte att hämta: ${e2?.message ?? 'filen saknas'}` };
  const id = randomUUID();
  const path = `${id}/${randomUUID()}.pdf`;
  const { error: e3 } = await admin.storage.from(BUCKET).upload(path, fil, { contentType: 'application/pdf' });
  if (e3) return { ok: false, status: 500, kod: 'kopia', error: `Kunde inte kopiera stämplingslängden: ${e3.message}` };
  const { error: e4 } = await admin.from('stamplings_rapport').insert({
    id, skapad_av: skapadAv, filnamn: kalla, storage_path: path, status: 'uppladdad', objekt_id: objektId,
  });
  if (e4) return { ok: false, status: 500, kod: 'spara', error: `Kunde inte spara rapporten: ${e4.message}` };
  return { ok: true, v: { id, finns: false } };
}

/** Läser rapporten med Claude och kontrollerar den. Redan läst → raden som den är (ingen ny betald läsning). */
export async function lasRapport(admin: SupabaseClient, id: string): Promise<Utfall<{ rad: RapportRad; varningar?: string[]; tokens?: unknown }>> {
  const { data, error } = await admin.from('stamplings_rapport').select('*').eq('id', id).maybeSingle();
  if (error) return { ok: false, status: 500, kod: 'las', error: error.message };
  const rad = data as RapportRad | null;
  if (!rad) return { ok: false, status: 404, kod: 'saknas', error: 'Rapporten finns inte.' };
  if (rad.status === 'lasning') return { ok: false, status: 409, kod: 'pagar', error: 'Rapporten läses redan.' };
  if (rad.las && rad.status !== 'fel') return { ok: true, v: { rad } };

  await admin.from('stamplings_rapport').update({ status: 'lasning', fel: null, uppdaterad: new Date().toISOString() }).eq('id', id);
  const misslyckad = async (kod: string, text: string, status: number): Promise<Utfall<never>> => {
    await admin.from('stamplings_rapport').update({ status: 'fel', fel: text, uppdaterad: new Date().toISOString() }).eq('id', id);
    return { ok: false, status, kod, error: text };
  };

  const { data: fil, error: e1 } = await admin.storage.from(BUCKET).download(rad.storage_path);
  if (e1 || !fil) return misslyckad('fil', `Filen gick inte att hämta ur lagringen: ${e1?.message ?? 'okänt fel'}. Ladda upp den igen.`, 500);
  try {
    const svar = await lasStamplingsrapport(new Uint8Array(await fil.arrayBuffer()));
    const kontroll = kontrollera(svar.lasning);
    const { data: ny, error: e2 } = await admin.from('stamplings_rapport')
      .update({ las: svar.lasning as unknown, modell: svar.modell, ...sammanfatta(svar.lasning, kontroll), fel: null })
      .eq('id', id).select('*').single();
    if (e2) return misslyckad('spara', `Läsningen lyckades men gick inte att spara: ${e2.message}`, 500);
    return { ok: true, v: { rad: ny as RapportRad, varningar: svar.varningar, tokens: svar.tokens } };
  } catch (e: any) {
    if (e instanceof LasFel) {
      const status = e.kod === 'ingen_nyckel' ? 503 : e.kod === 'for_stor' || e.kod === 'inte_pdf' ? 422 : 502;
      return misslyckad(e.kod, e.message, status);
    }
    return misslyckad('okant', `Läsningen misslyckades: ${e?.message ?? String(e)}`, 500);
  }
}

/** Läser om en redan läst rapport för att ta ut BARA utbyteskalkylen (rapporter lästa innan den lästes ut). Allt annat i läsningen
 *  — trädslagen, rättningen, kontrollen, statusen — rörs inte: talen man redan litar på får aldrig bytas ut av en ny läsning.
 *  Kalkylen läggs i `las` och, finns en rättning, i `rattad` (det är den som gäller). Har rapporten redan nyckeln görs ingenting. */
export async function lasUtbyteskalkyl(admin: SupabaseClient, id: string): Promise<Utfall<{ utbyteskalkyl: unknown }>> {
  const { data, error } = await admin.from('stamplings_rapport').select('*').eq('id', id).maybeSingle();
  if (error) return { ok: false, status: 500, kod: 'las', error: error.message };
  const rad = data as RapportRad | null;
  if (!rad?.las || typeof rad.las !== 'object') return { ok: false, status: 404, kod: 'saknas', error: 'Rapporten är inte läst.' };
  if ('utbyteskalkyl' in (rad.las as object)) return { ok: true, v: { utbyteskalkyl: (rad.las as Record<string, unknown>).utbyteskalkyl } };
  const { data: fil, error: e1 } = await admin.storage.from(BUCKET).download(rad.storage_path);
  if (e1 || !fil) return { ok: false, status: 500, kod: 'fil', error: `Filen gick inte att hämta: ${e1?.message ?? 'okänt fel'}` };
  try {
    const svar = await lasStamplingsrapport(new Uint8Array(await fil.arrayBuffer()));
    const u = svar.lasning.utbyteskalkyl ?? null;
    const patch: Record<string, unknown> = { las: { ...(rad.las as object), utbyteskalkyl: u } };
    if (rad.rattad && typeof rad.rattad === 'object') patch.rattad = { ...(rad.rattad as object), utbyteskalkyl: u };
    const { error: e2 } = await admin.from('stamplings_rapport').update(patch).eq('id', id);
    if (e2) return { ok: false, status: 500, kod: 'spara', error: e2.message };
    return { ok: true, v: { utbyteskalkyl: u } };
  } catch (e: any) {
    return { ok: false, status: 502, kod: e instanceof LasFel ? e.kod : 'okant', error: e?.message ?? String(e) };
  }
}
