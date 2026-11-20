// Färger och nollor i Avbrott-vyerna (skördare och skotare) — EN källa, så de två vyerna aldrig säger olika saker.
//
// Färgen på en stoppkategori är SEMANTISK och följer hur allvarligt stoppet är: neutral grå för skötsel som hör till jobbet,
// orange för störning, mörkare orange för reparation. Aldrig grön (betyder bra/produktion) och aldrig blå (reserverad för att
// navigera) på en stoppkategori. Färgen bär aldrig ensam: kategorins namn står bredvid i listan.
import { FARG } from '../design/tokens'

export const AVBROTT_TYPER = ['Underhåll', 'Störning', 'Övrigt', 'Reparation'] as const
export type AvbrottTyp = typeof AVBROTT_TYPER[number]

export const AVBROTT_TYP_FARG: Record<AvbrottTyp, string> = {
  'Underhåll':  FARG.text2,       // planerad skötsel — neutral
  'Övrigt':     FARG.text3,       // det som inte gick att sortera — en nyans dunklare grå
  'Störning':   FARG.orange,
  'Reparation': FARG.orangeMork,
}

/** Noll skrivs "0" överallt (aldrig streck): "0 ggr", "0 min". Streck är bara för "läses ännu" och "kunde inte läsas". */
export function avbrottTid(sek: number | null | undefined, fmt: (s: number) => string): string {
  if (!sek || !isFinite(sek) || sek <= 0) return '0 min'
  const t = fmt(sek)
  return t === '–' ? '0 min' : t     // under 30 s avrundas till 0 min av fmtTid
}

export const antalText = (n: number): string => `${n} ${n === 1 ? 'gång' : 'ggr'}`
