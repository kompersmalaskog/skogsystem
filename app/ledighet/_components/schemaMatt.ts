import { AVSTAND, KOLUMN } from '@/lib/design/tokens';

// Schema-rutnätets mått. LAYOUTMÅTT, inte avstånd (lib/design/tokens LAYOUT): de byts aldrig mot AVSTAND.
export const NAMN_W = 110;          // fast namnkolumn — scrollar inte horisontellt
export const DAG_MIN_W = 34;        // minsta dagkolumn (telefon: exakt så, med scroll i sidled)
export const FONSTER_TELEFON = 21;  // ~3 veckor, som förut
export const HUVUD_H = 48;          // veckodag + datum
export const PERSON_H = 44;         // en person — minst en träffyta hög
export const MASKIN_H = 48;         // en maskin — stoppblocket är en knapp och fyller hela raden i höjd
export const AVDELARE_H = 32;

/** Finns det mer att se åt höger i en sidscrollande ruta? (1 px marginal för avrundning.) */
export function merAttSeAtHoger(scrollLeft: number, clientWidth: number, scrollWidth: number): boolean {
  return scrollWidth - clientWidth - scrollLeft > 1;
}

/**
 * Hur många dagar rutnätet visar, och hur breda de är, för en given kolumnbredd (px).
 *
 *  - Telefon (kolumnen smalare än `telefonMax` minus sidmarginalerna): oförändrat — 21 dagar à 34 px
 *    med scroll i sidled bakom en fast namnkolumn.
 *  - Annars: så många HELA veckor som ryms utan scroll (2–4: 14, 21 eller 28 dagar), och dagbredden
 *    fyller kolumnen exakt. 1024 liggande → 21 dagar, 1440 → 28 dagar.
 */
export function schemaDagar(kolumnBredd: number): { antal: number; dagBredd: number } {
  const telefon = kolumnBredd < KOLUMN.telefonMax - 2 * AVSTAND.sidmarginal;
  if (!(kolumnBredd > 0) || telefon) return { antal: FONSTER_TELEFON, dagBredd: DAG_MIN_W };
  const veckor = Math.min(4, Math.max(2, Math.floor((kolumnBredd - NAMN_W) / (DAG_MIN_W * 7))));
  const antal = veckor * 7;
  return { antal, dagBredd: (kolumnBredd - NAMN_W) / antal };
}
