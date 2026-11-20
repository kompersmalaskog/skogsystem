// Dagrutnätets mått (components/design/Rutnat.tsx). Lyfta ur Ledighetens Schema (app/ledighet/_components/schemaMatt.ts) — SAMMA tal,
// och Rutnat.matt.test.ts jämför dem så de inte kan glida isär. LAYOUTMÅTT, inte avstånd (lib/design/tokens LAYOUT): byts aldrig mot AVSTAND.
export const NAMN_W = 110          // fast namnkolumn — scrollar inte horisontellt
export const DAG_MIN_W = 34        // minsta dagkolumn
export const HUVUD_H = 64          // IDAG-flik (16) + veckodag + datum (24); flikens plats finns på alla dagar så raderna inte hoppar
export const RAD_H = 48            // en rad — blocket är en knapp och fyller hela radens höjd (Schemats MASKIN_H)
export const AVDELARE_H = 32
/** Valfri högerkolumn (t.ex. klar-datum): fast till höger medan dagarna scrollar. Finns inte i Schemat. */
export const HOGER_W = 64

/** Finns det mer att se åt höger i en sidscrollande ruta? (1 px marginal för avrundning.) */
export function merAttSeAtHoger(scrollLeft: number, clientWidth: number, scrollWidth: number): boolean {
  return scrollWidth - clientWidth - scrollLeft > 1
}

/** Dagbredd för `antal` dagar i en ruta `bredd` px bred: fyller rutan, aldrig smalare än `min` (standard DAG_MIN_W — då scrollar rutan i sidled). */
export function dagBreddFor(bredd: number, antal: number, min: number = DAG_MIN_W): number {
  if (!(bredd > 0) || antal <= 0) return min
  return Math.max(min, (bredd - NAMN_W) / antal)
}
