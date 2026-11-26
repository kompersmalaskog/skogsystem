// Lugnare körvy — föraren dämpar själv det han är klar med (Martin 2026-11-23, Brokamåla 1:5: runt 100 saker på kartan, Stefan i Giant tycker det är rörigt).
//
// Tryck på en symbol i körvyn → "Klar" → symbolen blir halvgenomskinlig (samma bild, samma storlek). Tryck på en dämpad symbol → "Visa igen".
// Valet sparas per maskin + objekt + symbol, lokalt i maskinen (localStorage, som lib/korvySkyddslager) och finns kvar nästa dag. Ingen databas.
//
// DET HÄR GÅR ALDRIG ATT DÄMPA (inget Klar-val, och ett sparat val har ingen verkan):
//   • faror (SYMBOL_GRUPP 'fara')      — man ska aldrig kunna tysta en fara på kartan
//   • kultur (SYMBOL_GRUPP 'kultur')   — kulturlämning, odlingsröse m.fl.: lagen ser till att de syns
//   • allt med Viktigt-rad (#1247)     — planeraren har pekat ut det som viktigt
// Bara SYMBOLER dämpas. Linjer, ytor, pilar, traktgräns och bakgrund rörs inte. Skotaren och planeringsvyn påverkas inte (page.tsx kopplar in det
// bara för en skördare i körvyn).
import { SYMBOL_GRUPP, gruppForSymbol } from './larm/grupper';

/** Dämpad symbol: halvgenomskinlig. Lägre än avståndets golv (NARA_GOLV 0,4) så en dämpad nära symbol aldrig ser ut som en vanlig långt bort. */
export const KLAR_OPACITET = 0.35;

export const KLAR_NYCKEL = 'korvy_klarsymboler_v1';

/** localStorage-nyckeln för en maskin + ett objekt. Okänd maskin delar nyckeln 'ingen'. */
export function klarNyckel(maskinId: string | null | undefined, objektId: string | null | undefined): string | null {
  if (!objektId) return null;
  return `${KLAR_NYCKEL}:${maskinId || 'ingen'}:${objektId}`;
}

/** Symbolgrupper som aldrig går att dämpa. */
const ALDRIG_DAMPAD_GRUPP: ReadonlySet<string> = new Set(['fara', 'kultur']);

/** Går den här symbolen att dämpa? Typen avgör (fara och kultur aldrig), och allt med Viktigt-rad aldrig. */
export function kanDampas(typ: string | null | undefined, harViktigt = false): boolean {
  if (harViktigt) return false;
  return !ALDRIG_DAMPAD_GRUPP.has(gruppForSymbol(typ));
}

/** De symboltyper (ur symbolregistret) som går att dämpa respektive aldrig går att dämpa — för rapporten och testerna. */
export function dampbaraTyper(): string[] { return Object.keys(SYMBOL_GRUPP).filter((t) => kanDampas(t)).sort(); }
export function odampbaraTyper(): string[] { return Object.keys(SYMBOL_GRUPP).filter((t) => !kanDampas(t)).sort(); }

/** Tolka det sparade värdet: en lista med markerings-id. Trasigt eller fel form ger bara de giltiga (aldrig ett kast). */
export function tolkaKlara(raw: string | null | undefined): Set<string> {
  const ut = new Set<string>();
  if (!raw) return ut;
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) for (const id of p) if ((typeof id === 'string' && id) || typeof id === 'number') ut.add(String(id));
  } catch { /* trasig JSON → inget dämpat (hellre full än tyst dämpad) */ }
  return ut;
}

/** De symboler föraren dämpat på det här objektet. Tål blockerad eller saknad localStorage (då är allt fullt). */
export function hamtaKlara(maskinId: string | null | undefined, objektId: string | null | undefined): Set<string> {
  const nyckel = klarNyckel(maskinId, objektId);
  if (!nyckel) return new Set();
  try {
    if (typeof localStorage === 'undefined') return new Set();
    return tolkaKlara(localStorage.getItem(nyckel));
  } catch { return new Set(); }
}

/** Spara hela mängden. Tom mängd tar bort nyckeln (inga kvarglömda rader). */
export function sparaKlara(maskinId: string | null | undefined, objektId: string | null | undefined, klara: ReadonlySet<string>): void {
  const nyckel = klarNyckel(maskinId, objektId);
  if (!nyckel) return;
  try {
    if (typeof localStorage === 'undefined') return;
    if (klara.size === 0) localStorage.removeItem(nyckel);
    else localStorage.setItem(nyckel, JSON.stringify(Array.from(klara).sort()));
  } catch { /* blockerad localStorage: valet gäller medan sidan är öppen */ }
}

/** Mängden efter ett tryck på Klar / Visa igen. */
export function vaxlaKlar(klara: ReadonlySet<string>, id: string): Set<string> {
  const ny = new Set(klara);
  if (ny.has(id)) ny.delete(id); else ny.add(id);
  return ny;
}

/**
 * Opaciteten för en symbol: dämpad bara när föraren valt det OCH symbolen går att dämpa (ett sparat val för en fara eller något med Viktigt har ingen verkan —
 * t.ex. om en kommentar fått en Viktigt-rad efteråt). Annars avståndets styrka som förut. `slaPa` = om dämpning gäller alls (bara skördarens körvy).
 */
export function dampadOpacitet(
  basOpacitet: number,
  o: { id: string; typ: string | null | undefined; klara: ReadonlySet<string>; harViktigt: boolean; slaPa: boolean },
): number {
  if (!o.slaPa || !o.klara.has(String(o.id)) || !kanDampas(o.typ, o.harViktigt)) return basOpacitet;
  return Math.min(basOpacitet, KLAR_OPACITET);
}
