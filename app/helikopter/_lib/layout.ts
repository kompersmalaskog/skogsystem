// /helikopter — layoutlägen. Ren logik (testbar): inget här vet något om React eller DOM.
//
// Samma kort på alla bredder. Det som ändras är hur många kolumner som får plats:
//   telefon  < 600 px      en kolumn, tre flikar, sheets underifrån
//   ipad     600–1 100 px  två kolumner: Läge · (Planering | Uppföljning), sheets som panel
//   stor     > 1 100 px    tre kolumner: Läge · Planering · Uppföljning, sheets som panel
// Ett kort är aldrig bredare än KORT_MAX_PX. Kolumnerna centreras; luft på sidorna är rätt.
import { PANEL_BREDD_PX } from '@/lib/plusArk'
import { AVSTAND } from '@/lib/design/tokens'

export type Lage = 'telefon' | 'ipad' | 'stor'

/** Layoutmått (inte avstånd): var ett läge börjar. */
export const IPAD_MIN_PX = 600
/** "Stor skärm > 1 100 px" — 1 100 exakt är fortfarande iPad. */
export const STOR_MIN_PX = 1101
/** /helikopter/veckor: båda spåren sida vid sida från och med den här bredden. */
export const VECKOR_TVA_SPAR_MIN_PX = 900

/** Layoutmått: ett kort är aldrig bredare än så här. */
export const KORT_MAX_PX = 420
/** Layoutmått: /helikopter/veckor, max bredd per spår när båda visas. */
export const SPAR_MAX_PX = 480

export const KOLUMN_GAP = AVSTAND.l
export const SIDMARGINAL = AVSTAND.sidmarginal
/** Panelen: samma 380 px som plus-arkets panel (lib/plusArk). */
export const PANEL_PX = PANEL_BREDD_PX

export function lageForBredd(fonsterBredd: number): Lage {
  if (fonsterBredd >= STOR_MIN_PX) return 'stor'
  if (fonsterBredd >= IPAD_MIN_PX) return 'ipad'
  return 'telefon'
}

export function antalKolumner(lage: Lage): 1 | 2 | 3 {
  return lage === 'stor' ? 3 : lage === 'ipad' ? 2 : 1
}

/** Bredd på n kolumner à `kortPx` med mellanrum — utan sidmarginaler. */
export function kolumnerBredd(n: number, kortPx: number = KORT_MAX_PX): number {
  return n * kortPx + (n - 1) * KOLUMN_GAP
}

/** Hur breda korten faktiskt blir i fönstret (högst KORT_MAX_PX). */
export function kortBredd(fonsterBredd: number, n: number): number {
  const ledigt = fonsterBredd - 2 * SIDMARGINAL - (n - 1) * KOLUMN_GAP
  return Math.max(0, Math.min(KORT_MAX_PX, ledigt / n))
}

/**
 * Får panelen plats BREDVID kolumnerna? Då skjuts kolumngruppen åt vänster utan att korten blir smalare.
 * Annars läggs panelen över högerkolumnen. En panel kan inte ha mer än plats för kolumnerna som de är just nu:
 * den trycker aldrig ihop dem.
 */
export function panelPlats(fonsterBredd: number, n: number): boolean {
  if (n <= 1) return false
  const kolumner = n * kortBredd(fonsterBredd, n) + (n - 1) * KOLUMN_GAP
  const kvar = fonsterBredd - PANEL_PX - KOLUMN_GAP - 2 * SIDMARGINAL
  return kvar >= kolumner
}

/** Högerkolumnens val på iPad. `flik=lage` (och ingen flik alls) betyder Planering. */
export function hogerFlik(flik: 'lage' | 'planering' | 'uppfoljning' | 'historik'): 'planering' | 'uppfoljning' | 'historik' {
  return flik === 'uppfoljning' || flik === 'historik' ? flik : 'planering'
}
