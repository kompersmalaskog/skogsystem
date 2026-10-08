// Tidsgränser för läsningarna i /oversikt-v2 (fynd G). Ett anrop som aldrig får svar — nätet försvinner mitt i en läsning, och klienten har
// ingen egen tidsgräns — lämnade sidan på "Laddar kartan…" för alltid, och för de sekundära läsningarna hölls ALLA andra resultat (position,
// virke på backen, GROT, telefon) tillbaka tills den långsammaste kommit. Efter tidsgränsen räknas läsningen som misslyckad och sidan säger
// det (felruta för kärndatan, banner för resten): ett läsfel är aldrig "ingen".

/** Objekt, maskiner och köer: utan dem finns ingen karta. */
export const TIDSGRANS_KARN = 15000;
/** Position, virke på backen, GROT och telefon: flera steg per läsning, men aldrig för evigt. */
export const TIDSGRANS_SEKUNDAR = 25000;

/** Ger upp efter `ms` utan svar. Begäran avbryts inte (klienten har ingen avbrytare här) men dess svar ignoreras. */
export function medTidsgrans<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`inget svar inom ${ms} ms`)), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}
