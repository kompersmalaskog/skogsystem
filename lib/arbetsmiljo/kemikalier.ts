// KEMIKALIEFÖRTECKNINGEN (2026-11-03): varje produkt vi har, var den finns och dess säkerhetsdatablad (PDF).
// Svarar på "Har vi säkerhetsbladet för allt vi använder?". Förarna öppnar bladet; admin och skyddsombud lägger till och byter.
// Tabellen am_kemikalie och bucketen am-sdb (migration 20261103135655_am_kemikalier.sql). En gång om året går man igenom
// listan — det är årshjulets punkt Kemikalierna, som bockas av härifrån (samma tabell som i årshjulet).
//
// Ren logik utom läsning och skrivning längst ner. Texterna ändras HÄR.

import type { SupabaseClient } from '@supabase/supabase-js';

export const BUCKET = 'am-sdb';
export const MAX_MB = 20;

export type Kemikalie = {
  id: string;
  namn: string;
  varFinns: string | null;
  sdbSokvag: string | null;
  sdbTid: string | null;
};

/** Svaret överst. */
export function svar(k: readonly Kemikalie[]): { text: string; under: string | null; ton?: 'orange' } {
  if (k.length === 0) return { text: 'Inga produkter än', under: 'Lägg till oljor, sprayer och bränsle ni använder.' };
  const saknar = k.filter(x => !x.sdbSokvag).length;
  const produkter = k.length === 1 ? '1 produkt' : `${k.length} produkter`;
  if (saknar === 0) return { text: 'Säkerhetsblad finns för allt', under: produkter };
  return { text: saknar === 1 ? '1 saknar säkerhetsblad' : `${saknar} saknar säkerhetsblad`, under: produkter, ton: 'orange' };
}

/** De som saknar blad först, sedan i bokstavsordning. */
export function ordna(k: readonly Kemikalie[]): Kemikalie[] {
  return [...k].sort((a, b) => (a.sdbSokvag ? 1 : 0) - (b.sdbSokvag ? 1 : 0) || a.namn.localeCompare(b.namn, 'sv'));
}

/** Raden under namnet. */
export function radUnder(k: Kemikalie): string {
  return k.varFinns?.trim() || 'Var den finns är inte ifyllt';
}

/** En fil som inte är en PDF eller är för stor stoppas innan något laddas upp. null = ok. */
export function filFel(f: { type: string; size: number; name: string }): string | null {
  const pdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  if (!pdf) return 'Säkerhetsbladet måste vara en PDF.';
  if (f.size > MAX_MB * 1024 * 1024) return `Filen är större än ${MAX_MB} MB.`;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Läsning och skrivning
// ---------------------------------------------------------------------------------------------------------------------------

type Rad = { id: string; namn: string; var_finns: string | null; sdb_sokvag: string | null; sdb_tid: string | null };

/** Alla aktiva. null = kunde inte läsas (aldrig "inga produkter"). */
export async function hamtaKemikalier(sb: SupabaseClient): Promise<Kemikalie[] | null> {
  const { data, error } = await sb.from('am_kemikalie').select('id, namn, var_finns, sdb_sokvag, sdb_tid').eq('aktiv', true);
  if (error) return null;
  return ((data ?? []) as Rad[]).map(r => ({ id: r.id, namn: r.namn, varFinns: r.var_finns, sdbSokvag: r.sdb_sokvag, sdbTid: r.sdb_tid }));
}

/** Ladda upp ett blad. Sökvägen returneras, eller null vid fel. */
async function laddaUpp(sb: SupabaseClient, id: string, fil: Blob): Promise<string | null> {
  const sokvag = `${id}/${Date.now()}.pdf`;
  const { error } = await sb.storage.from(BUCKET).upload(sokvag, fil, { contentType: 'application/pdf', upsert: false });
  return error ? null : sokvag;
}

/** Ny produkt. Bladet är valfritt. Fel = text, annars null. */
export async function laggTill(sb: SupabaseClient, namn: string, varFinns: string, fil: Blob | null): Promise<string | null> {
  const n = namn.trim();
  if (!n) return 'Skriv vad produkten heter.';
  const id = crypto.randomUUID();
  let sokvag: string | null = null;
  if (fil) {
    sokvag = await laddaUpp(sb, id, fil);
    if (!sokvag) return 'Kunde inte ladda upp säkerhetsbladet. Försök igen.';
  }
  const { error } = await sb.from('am_kemikalie').insert({ id, namn: n.slice(0, 120), var_finns: varFinns.trim().slice(0, 120) || null, sdb_sokvag: sokvag });
  return error ? 'Kunde inte spara just nu. Försök igen.' : null;
}

/** Byt (eller lägg till) säkerhetsbladet. Det gamla ligger kvar i bucketen. */
export async function bytBlad(sb: SupabaseClient, id: string, fil: Blob): Promise<string | null> {
  const sokvag = await laddaUpp(sb, id, fil);
  if (!sokvag) return 'Kunde inte ladda upp säkerhetsbladet. Försök igen.';
  const { data, error } = await sb.from('am_kemikalie').update({ sdb_sokvag: sokvag }).eq('id', id).select('id');
  if (error || !data || data.length === 0) return 'Kunde inte spara just nu. Försök igen.';
  return null;
}

/** Ändra var den finns. */
export async function andraVar(sb: SupabaseClient, id: string, varFinns: string): Promise<string | null> {
  const { data, error } = await sb.from('am_kemikalie').update({ var_finns: varFinns.trim().slice(0, 120) || null }).eq('id', id).select('id');
  return error || !data || data.length === 0 ? 'Kunde inte spara just nu. Försök igen.' : null;
}

/** "Används inte längre": produkten försvinner ur listan men raderas aldrig. */
export async function taBort(sb: SupabaseClient, id: string): Promise<string | null> {
  const { data, error } = await sb.from('am_kemikalie').update({ aktiv: false }).eq('id', id).select('id');
  return error || !data || data.length === 0 ? 'Kunde inte ta bort just nu. Försök igen.' : null;
}

/** Bladets länk (privat bucket, 10 min). null = gick inte. */
export async function bladLank(sb: SupabaseClient, sokvag: string): Promise<string | null> {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(sokvag, 600);
  return error || !data?.signedUrl ? null : data.signedUrl;
}
