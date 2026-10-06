// Köskrivningar för /oversikt-v2 — VERIFIERADE. Ren logik (klienten injiceras), Node-importerbar, testas i ko-skriv.test.ts.
//
// Varje skrivning gör tre saker: (1) läser kön FÄRSKT ur databasen (skärmens kopia kan vara gammal — någon annan kan ha ändrat
// den), (2) skriver, (3) läser tillbaka INNEHÅLLET och jämför mot det som skulle skrivas. Ett `{error}` är inte hela sanningen:
// en update eller delete som träffar 0 rader (borttagen rad, RLS) ger inget fel alls — så det som avgör är att kön i databasen
// ser ut som den skulle. Ett fel som ändå landade (t.ex. två som lade samma objekt samtidigt) är ingen förlust.
//
// Svaret bär kön som den faktiskt ligger i databasen (`ko`), lyckad skrivning eller inte, så skärmen kan ritas om från
// sanningen. `ko: null` = kön gick inte att läsa → skärmen lämnas orörd och användaren får veta att det inte går att avgöra.
// Teknik (felmeddelanden från databasen) hamnar i konsolen, aldrig i arket.

import type { MaskinKoItem } from '../oversikt/oversikt-types';

export const KO_SPARFEL = 'Kunde inte spara — försök igen';
export const KO_LASFEL = 'Kunde inte läsa kön efteråt — ladda om sidan';
export const KO_RAD_BORTA = 'Raden finns inte längre i kön';

export interface KoSvar { ok: boolean; meddelande: string | null; ko: MaskinKoItem[] | null }
/** Så lite av supabase-klienten som behövs — ingen import av den, så modulen går att köra i Node och mot en fake. */
type Sb = { from: (tabell: string) => any };

const KOLUMNER = 'id, maskin_id, objekt_id, ordning, created_at';
const maxOrdning = (ko: MaskinKoItem[], maskinId: string) => ko.filter((k) => k.maskin_id === maskinId).reduce((m, k) => Math.max(m, k.ordning), -1);
const svar = (ok: boolean, ko: MaskinKoItem[] | null, meddelande: string = KO_SPARFEL): KoSvar => ({ ok, meddelande: ok ? null : meddelande, ko });
/** Hela kön försvann på en skrivning som aldrig kan tömma den: en tyst tom läsning (RLS, hickning), inte en tom kö. */
const tystTom = (fore: MaskinKoItem[], efter: MaskinKoItem[]) => fore.length > 0 && efter.length === 0;

/** Hela kön ur databasen (id som tiebreaker så raderna aldrig byter plats mellan läsningar). null = kunde inte läsas. */
export async function lasKo(sb: Sb): Promise<MaskinKoItem[] | null> {
  try {
    const { data, error } = await sb.from('maskin_ko').select(KOLUMNER).order('ordning').order('id');
    if (error) { console.error('[Översikt v2] kö: läsningen gav fel', error.message ?? error); return null; }
    return Array.isArray(data) ? (data as MaskinKoItem[]) : null;
  } catch (e) { console.error('[Översikt v2] kö: läsningen kastade', e); return null; }
}

/** Skriv och släpp resultatet: om skrivningen "lyckades" avgör inte svaret utan den efterföljande läsningen. Kastar aldrig. */
async function skriv(vad: string, f: () => PromiseLike<any>): Promise<void> {
  try {
    const r = await f();
    if (r && r.error) console.error(`[Översikt v2] kö: ${vad} gav fel`, r.error.message ?? r.error);
  } catch (e) { console.error(`[Översikt v2] kö: ${vad} kastade`, e); }
}

/** Lägg objektet sist i maskinens kö. Ligger det redan där är målet nått (ingen ny rad). */
export async function laggIKoVerifierat(sb: Sb, maskinId: string, objektId: string): Promise<KoSvar> {
  const fore = await lasKo(sb);
  if (!fore) return svar(false, null);                                   // inget skrevs — "försök igen" stämmer
  if (fore.some((k) => k.maskin_id === maskinId && k.objekt_id === objektId)) return svar(true, fore);
  await skriv('insert', () => sb.from('maskin_ko').insert({ maskin_id: maskinId, objekt_id: objektId, ordning: maxOrdning(fore, maskinId) + 1 }));
  const efter = await lasKo(sb);
  if (!efter || tystTom(fore, efter)) return svar(false, null, KO_LASFEL);
  return svar(efter.some((k) => k.maskin_id === maskinId && k.objekt_id === objektId), efter);
}

/** Flytta kö-raden till slutet av en annan maskins kö. */
export async function flyttaKoVerifierat(sb: Sb, koId: string, tillMaskin: string): Promise<KoSvar> {
  const fore = await lasKo(sb);
  if (!fore) return svar(false, null);
  const rad = fore.find((k) => k.id === koId);
  if (!rad) return svar(false, fore, KO_RAD_BORTA);                      // någon annan tog bort den — skärmen ritas om
  if (rad.maskin_id === tillMaskin) return svar(true, fore);             // redan där
  const ordning = maxOrdning(fore, tillMaskin) + 1;
  await skriv('update (flytt)', () => sb.from('maskin_ko').update({ maskin_id: tillMaskin, ordning }).eq('id', koId));
  const efter = await lasKo(sb);
  if (!efter || tystTom(fore, efter)) return svar(false, null, KO_LASFEL);
  const ny = efter.find((k) => k.id === koId);
  return svar(!!ny && ny.maskin_id === tillMaskin && ny.ordning === ordning, efter);
}

/** Ta bort kö-raden. Finns den inte längre är målet nått (ingen skrivning). */
export async function taBortKoVerifierat(sb: Sb, koId: string): Promise<KoSvar> {
  const fore = await lasKo(sb);
  if (!fore) return svar(false, null);
  if (!fore.some((k) => k.id === koId)) return svar(true, fore);
  await skriv('delete', () => sb.from('maskin_ko').delete().eq('id', koId));
  const efter = await lasKo(sb);
  if (!efter || (fore.length > 1 && efter.length === 0)) return svar(false, null, KO_LASFEL); // sista raden får tömma kön — fler än en får det inte
  return svar(!efter.some((k) => k.id === koId), efter);
}

/** Skriv om ordningen (0..n) för en maskin: de synliga i ny ordning först, dolda (avslutade/nu) efter så att gamla vyns kö inte
 *  tappar rader. Är skärmen ur fas med databasen (okänt eller dubbelt id) skrivs ingenting — den ritas om från sanningen. */
export async function skrivOrdningVerifierat(sb: Sb, maskinId: string, synligaIds: string[]): Promise<KoSvar> {
  const fore = await lasKo(sb);
  if (!fore) return svar(false, null);
  const mina = fore.filter((k) => k.maskin_id === maskinId);
  const minaIds = new Set(mina.map((k) => k.id));
  if (new Set(synligaIds).size !== synligaIds.length || synligaIds.some((id) => !minaIds.has(id))) return svar(false, fore);
  const rest = mina.filter((k) => synligaIds.indexOf(k.id) < 0).map((k) => k.id); // `fore` är redan sorterad på (ordning, id) → de dolda behåller sin inbördes ordning
  const full = [...synligaIds, ...rest];
  await Promise.all(full.map((id, i) => skriv('update (ordning)', () => sb.from('maskin_ko').update({ ordning: i }).eq('id', id))));
  const efter = await lasKo(sb);
  if (!efter || tystTom(fore, efter)) return svar(false, null, KO_LASFEL);
  const stammer = full.every((id, i) => { const r = efter.find((k) => k.id === id); return !!r && r.maskin_id === maskinId && r.ordning === i; });
  return svar(stammer, efter);
}

/** En skrivning i taget: nästa börjar när den förra är klar och läser då kön FÄRSKT — två tryck i rad (eller två flikar) ger
 *  aldrig samma `ordning` eller en läsning mitt i en annans skrivning. Ett undantag i en skrivning stoppar inte nästa. */
export function skapaKoKedja() {
  let senaste: Promise<unknown> = Promise.resolve();
  return function kor<T>(op: () => Promise<T>): Promise<T> {
    const nasta = senaste.then(op);        // `senaste` avvisas aldrig (se raden nedan)
    senaste = nasta.catch(() => undefined);
    return nasta;
  };
}
