/**
 * Gå-läget när man snitslar stickvägar (Martin 2026-11-13: "kartan där nere och meter där uppe" — avståndet till förra vägen ska synas
 * hela tiden så man slipper stega, och kartan ska synas samtidigt). Rena regler; ritningen i components/planering/SnitselPanel.tsx.
 */
export interface SnitselLage {
  /** Meter till vägen man mäter mot; null = ingen väg än (första vägen) eller ingen position. */
  dist: number | null
  target: number
  tol: number
}
export type SnitselTon = 'neutral' | 'inom' | 'utanfor'

export function snitselTon(l: SnitselLage): SnitselTon {
  if (l.dist == null) return 'neutral'
  return Math.abs(l.dist - l.target) <= l.tol ? 'inom' : 'utanfor'
}

/** Vad man ska göra, i ord: "inom mål", "6 m till" (gå längre ut), "4 m för långt" (gå in mot vägen). */
export function snitselRiktning(l: SnitselLage): string {
  if (l.dist == null) return 'Första vägen'
  if (Math.abs(l.dist - l.target) <= l.tol) return 'Inom mål'
  return l.dist < l.target ? `${l.target - l.dist} m till` : `${l.dist - l.target} m för långt`
}

/** Mätaren visar mål ± SPAN meter. */
export const SNITSEL_SPAN_M = 15
/** Läget på mätaren i procent (0–100, nålad vid kanterna) och det gröna bandets kanter. */
export function snitselMatare(l: SnitselLage): { prick: number | null; bandFran: number; bandTill: number; utanforSkala: boolean } {
  const lo = l.target - SNITSEL_SPAN_M, hi = l.target + SNITSEL_SPAN_M
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))
  return { prick: l.dist == null ? null : pct(l.dist), bandFran: pct(l.target - l.tol), bandTill: pct(l.target + l.tol), utanforSkala: l.dist != null && (l.dist < lo || l.dist > hi) }
}

/** GPS-raden: säger när siffran inte går att lita på (sämre än 15 m räknas som osäker — samma gräns som spårningen). */
export const SNITSEL_OSAKER_M = 15
export function snitselGpsText(noggrannhetM: number | null): { text: string; osaker: boolean } {
  if (noggrannhetM == null) return { text: 'Söker GPS …', osaker: false }
  const n = Math.round(noggrannhetM)
  return n > SNITSEL_OSAKER_M ? { text: `Osäker position · ±${n} m`, osaker: true } : { text: `GPS ±${n} m`, osaker: false }
}

/** Kartan följer den som går, men inte medan man själv drar i kartan (och en stund efter). */
export const SNITSEL_FOLJ_PAUS_MS = 8000
export const SNITSEL_ZOOM = 18
