// KEMIKALIEFÖRTECKNINGEN (2026-11-03): varje produkt vi har, var den finns och dess säkerhetsdatablad (PDF).
// Svarar på "Har vi säkerhetsbladet för allt vi använder?". ALLA lägger till det de köpt (foto på etiketten, namn, var); förarna öppnar
// bladet; admin och skyddsombud byter blad, ändrar och tar bort. Saknas bladet får admin en push (am_kemikalie, kemikalieNotis.ts).
// Tabellen am_kemikalie och bucketen am-sdb (migrationerna 20261103135655_am_kemikalier.sql, 20261103141033_am_kemikalier_alla_lagger_till.sql). En gång om året går man igenom
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
  /** Foto på etiketten (faromärkningen syns där). */
  etikettSokvag: string | null;
  /** Faroangivelserna ur bladet (H350 …). null = bladet är inte läst än; [] = inga. */
  hKoder?: string[] | null;
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
/** Etikettens foto: en bild, högst 20 MB (komprimeras före uppladdning). null = ok. */
export function bildFel(f: { type: string; size: number }): string | null {
  if (!f.type.startsWith('image/')) return 'Välj en bild.';
  if (f.size > MAX_MB * 1024 * 1024) return `Bilden är större än ${MAX_MB} MB.`;
  return null;
}

export function filFel(f: { type: string; size: number; name: string }): string | null {
  const pdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  if (!pdf) return 'Säkerhetsbladet måste vara en PDF.';
  if (f.size > MAX_MB * 1024 * 1024) return `Filen är större än ${MAX_MB} MB.`;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Läsning och skrivning
// ---------------------------------------------------------------------------------------------------------------------------

type Rad = { id: string; namn: string; var_finns: string | null; sdb_sokvag: string | null; sdb_tid: string | null; etikett_sokvag?: string | null; h_koder?: string[] | null };

/** Alla aktiva. null = kunde inte läsas (aldrig "inga produkter"). */
export async function hamtaKemikalier(sb: SupabaseClient): Promise<Kemikalie[] | null> {
  const { data, error } = await sb.from('am_kemikalie').select('id, namn, var_finns, sdb_sokvag, sdb_tid, etikett_sokvag, h_koder').eq('aktiv', true);
  if (error) return null;
  return ((data ?? []) as Rad[]).map(r => ({ id: r.id, namn: r.namn, varFinns: r.var_finns, sdbSokvag: r.sdb_sokvag, sdbTid: r.sdb_tid, etikettSokvag: r.etikett_sokvag ?? null, hKoder: r.h_koder ?? null }));
}

/** Ladda upp ett blad (PDF) eller etikettens foto (JPEG). Sökvägen returneras, eller null vid fel. */
async function laddaUpp(sb: SupabaseClient, id: string, fil: Blob, slag: 'blad' | 'etikett' = 'blad'): Promise<string | null> {
  const sokvag = slag === 'blad' ? `${id}/${Date.now()}.pdf` : `${id}/etikett-${Date.now()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(sokvag, fil, { contentType: slag === 'blad' ? 'application/pdf' : 'image/jpeg', upsert: false });
  return error ? null : sokvag;
}

/** Ny produkt. Fotot och bladet är valfria. Fel = text, annars null. */
export async function laggTill(
  sb: SupabaseClient, namn: string, varFinns: string, fil: Blob | null, etikett: Blob | null = null, koder: string[] | null = null,
): Promise<string | null> {
  const n = namn.trim();
  if (!n) return 'Skriv vad produkten heter.';
  const id = crypto.randomUUID();
  let sokvag: string | null = null;
  let etikettSokvag: string | null = null;
  if (etikett) {
    etikettSokvag = await laddaUpp(sb, id, etikett, 'etikett');
    if (!etikettSokvag) return 'Kunde inte ladda upp fotot. Försök igen.';
  }
  if (fil) {
    sokvag = await laddaUpp(sb, id, fil);
    if (!sokvag) return 'Kunde inte ladda upp säkerhetsbladet. Försök igen.';
  }
  const rad: Record<string, unknown> = { id, namn: n.slice(0, 120), var_finns: varFinns.trim().slice(0, 120) || null, sdb_sokvag: sokvag };
  if (etikettSokvag) rad.etikett_sokvag = etikettSokvag;
  if (sokvag && koder) rad.h_koder = koder;
  const { error } = await sb.from('am_kemikalie').insert(rad);
  return error ? 'Kunde inte spara just nu. Försök igen.' : null;
}

/** Byt (eller lägg till) säkerhetsbladet. Det gamla ligger kvar i bucketen. */
export async function bytBlad(sb: SupabaseClient, id: string, fil: Blob, koder: string[] | null = null): Promise<string | null> {
  const sokvag = await laddaUpp(sb, id, fil);
  if (!sokvag) return 'Kunde inte ladda upp säkerhetsbladet. Försök igen.';
  // Nytt blad: koderna läses om (null = inte lästa, läses i efterhand).
  const { data, error } = await sb.from('am_kemikalie').update({ sdb_sokvag: sokvag, h_koder: koder }).eq('id', id).select('id');
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

/** Länk till bladet eller fotot (privat bucket, 10 min). null = gick inte. */
export async function bladLank(sb: SupabaseClient, sokvag: string): Promise<string | null> {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(sokvag, 600);
  return error || !data?.signedUrl ? null : data.signedUrl;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Hittar appen inget blad: ett färdigt mejl till leverantören. Mottagaren fyller man i själv (appen vet inte var produkten köptes).
// ---------------------------------------------------------------------------------------------------------------------------

export function mejlLank(namn: string, tillverkare: string | null, avsandare: string | null): string {
  const produkt = tillverkare && !namn.toLowerCase().includes(tillverkare.toLowerCase()) ? `${tillverkare} ${namn}` : namn;
  const amne = `Säkerhetsdatablad för ${produkt}`;
  const text = [
    'Hej!',
    '',
    `Kan ni skicka säkerhetsdatabladet (SDB) för ${produkt}? Vi använder den i vår skogsverksamhet och behöver bladet enligt AFS 2023:10.`,
    '',
    'Tack på förhand!',
    avsandare ? `${avsandare}, Kompersmåla Skog AB` : 'Kompersmåla Skog AB',
  ].join('\n');
  return `mailto:?subject=${encodeURIComponent(amne)}&body=${encodeURIComponent(text)}`;
}

// ---------------------------------------------------------------------------------------------------------------------------
// FAROR UR BLADET (2026-11-04). Avsnitt 2 i ett säkerhetsdatablad listar produktens faroangivelser som koder (H350, H317 …).
// Appen läser koderna ur PDF:en när bladet läggs in, så ingen behöver läsa bladet för att se om produkten kan ge cancer eller allergi
// — de produkterna ska man titta på särskilt (AFS 2023:10: byt till en ofarligare om det går). Vanliga oljor har inga av dem.
// ---------------------------------------------------------------------------------------------------------------------------

/** Alla H-koder i texten, utan dubbletter, i nummerordning ("H 350" och "H350i" känns igen; "H360FD" behåller bokstäverna). */
export function hKoder(text: string): string[] {
  const ut = new Set<string>();
  for (const m of text.matchAll(/(?<![A-Za-z0-9])(EUH|H)\s?(\d{3})(i|[FfDd]{1,2})?(?![0-9])/g)) {
    if (m[1] === 'EUH') continue;
    const nr = Number(m[2]);
    if (nr < 200 || nr > 420) continue;
    ut.add(`H${m[2]}${m[3] ?? ''}`);
  }
  return [...ut].sort((a, b) => a.localeCompare(b, 'sv', { numeric: true }));
}

export type FaraSlag = 'cancer' | 'allergi' | 'gift' | 'brand' | 'miljo';
export type Fara = { slag: FaraSlag; titel: string; gora: string; allvarlig: boolean; koder: string[] };

const FAROR: ReadonlyArray<{ slag: FaraSlag; titel: string; gora: string; allvarlig: boolean; test: (nr: number) => boolean }> = [
  { slag: 'cancer', titel: 'Kan ge cancer eller skada arvsmassan', gora: 'Byt till en ofarligare produkt om det går. Annars: handskar och bra ventilation, aldrig på huden.', allvarlig: true,
    test: n => [340, 341, 350, 351, 360, 361, 362].includes(n) },
  { slag: 'allergi', titel: 'Kan ge allergi', gora: 'Handskar. Låt den inte komma på huden eller andas in den.', allvarlig: true,
    test: n => n === 317 || n === 334 },
  { slag: 'gift', titel: 'Giftig', gora: 'Läs säkerhetsbladet innan du använder den.', allvarlig: true,
    test: n => [300, 301, 310, 311, 330, 331, 370, 372].includes(n) },
  { slag: 'brand', titel: 'Brandfarlig', gora: 'Ingen gnista eller öppen eld i närheten.', allvarlig: false,
    test: n => n >= 220 && n <= 228 },
  { slag: 'miljo', titel: 'Farlig för vatten och fisk', gora: 'Spill i marken ska tas upp.', allvarlig: false,
    test: n => n === 400 || n === 410 || n === 411 },
];

/** Koderna som faror i vardagsord, allvarligast först. Okända koder visas inte (de flesta är irritation, yrsel …). */
export function faror(koder: readonly string[] | null | undefined): Fara[] {
  if (!koder) return [];
  const ut: Fara[] = [];
  for (const f of FAROR) {
    const traffar = koder.filter(k => f.test(Number(k.slice(1, 4))));
    if (traffar.length) ut.push({ slag: f.slag, titel: f.titel, gora: f.gora, allvarlig: f.allvarlig, koder: traffar });
  }
  return ut;
}

/** Raden i listan: de allvarliga farorna, annars null. */
export function faraRad(k: Pick<Kemikalie, 'hKoder'>): string | null {
  const a = faror(k.hKoder).filter(f => f.allvarlig);
  return a.length ? a.map(f => f.titel).join(' · ') : null;
}

/** Spara koderna på en produkt (admin, när ett äldre blad lästs i efterhand). */
export async function sparaKoder(sb: SupabaseClient, id: string, koder: string[]): Promise<boolean> {
  const { data, error } = await sb.from('am_kemikalie').update({ h_koder: koder }).eq('id', id).select('id');
  return !error && !!data && data.length > 0;
}
