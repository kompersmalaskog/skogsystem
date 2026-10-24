// PROGNOSEN SOM FÖLJER TRAKTEN (2026-10-24, Martin: "man kan komma in i en hörna som det går jättebra i, eller tvärtom").
//
// Prognosen för en trakt (G15-timmar, planerarens eller appens förslag) är satt INNAN maskinen börjat. När maskinen kört ett tag vet vi hur fort
// det faktiskt går på just den trakten: utfört volym / utförda G15-timmar. Resten räknas då på den takten — men viktad mot prognosen, så att
// en konstig första dag (flytt, uppställning, en blöt hörna) inte slår om hela bilden:
//
//   takt = (prognosens takt × PRIOR_H + uppmätt takt × utförda timmar) / (PRIOR_H + utförda timmar)
//   kvar = kvarvarande volym / takt
//
// PRIOR_H = 8: prognosen väger som åtta timmars utfall. Efter en dag väger de lika; efter en vecka väger utfallet fem gånger mer. Under MIN_H
// (4 G15-timmar) säger utfallet för lite och prognosen gäller rakt av. Saknas prognos men finns utfall (≥ MIN_H) räknas resten på den uppmätta
// takten ensam.
//
// Ren funktion, inga sidoeffekter. Volymen är m³fub, tiden G15-timmar (lib/g15.ts). Allt som ritas ("12 % snabbare än prognosen") kommer ur
// `skillnad`, som är uppmätt takt mot prognosens takt — INTE den viktade (den vore ett mellanting ingen känner igen).

export const FOLJER_MIN_H = 4
export const FOLJER_PRIOR_H = 8

export type FoljerIndata = {
  /** Traktens volym för rollen (m³fub). null = okänd → ingen följande prognos. */
  volym: number | null
  /** Prognosen i G15-timmar för HELA trakten (planerarens eller appens). null = saknas. */
  prognosH: number | null
  /** G15-timmar redan lagda på trakten för rollen. */
  utfortH: number
  /** m³fub redan gjorda för rollen (skördat resp. skotat). */
  utfortVolym: number
}

export type FoljerResultat = {
  /** Kvarvarande G15-timmar enligt den följande takten. */
  restH: number
  /** Kvarvarande G15-timmar enligt prognosen rakt av (prognos − utfört, aldrig under 0). null utan prognos. */
  restPlanH: number | null
  /** Uppmätt takt mot prognosens takt: +0,12 = det går 12 % fortare än prognosen. null utan prognos. */
  skillnad: number | null
  /** G15-timmar utfallet bygger på. */
  utfortH: number
}

/** null = inget att följa (för lite utfört, okänd volym, inget gjort) — då gäller prognosen som förut. */
export function foljPrognos(i: FoljerIndata): FoljerResultat | null {
  if (i.volym == null || !(i.volym > 0)) return null
  if (!(i.utfortH >= FOLJER_MIN_H) || !(i.utfortVolym > 0)) return null
  const uppmatt = i.utfortVolym / i.utfortH
  const prior = i.prognosH != null && i.prognosH > 0 ? i.volym / i.prognosH : null
  const takt = prior == null ? uppmatt : (prior * FOLJER_PRIOR_H + uppmatt * i.utfortH) / (FOLJER_PRIOR_H + i.utfortH)
  const restVol = Math.max(0, i.volym - i.utfortVolym)
  const restH = Math.round((restVol / takt) * 100) / 100
  const restPlanH = i.prognosH == null ? null : Math.max(0, Math.round((i.prognosH - i.utfortH) * 100) / 100)
  const skillnad = prior == null ? null : Math.round((uppmatt / prior - 1) * 1000) / 1000
  return { restH, restPlanH, skillnad, utfortH: i.utfortH }
}

/** "12 % fortare än prognosen" / "8 % långsammare än prognosen" / "som prognosen" (under 5 % åt något håll). null utan prognos. */
export function skillnadText(skillnad: number | null): string | null {
  if (skillnad == null) return null
  const p = Math.round(Math.abs(skillnad) * 100)
  if (p < 5) return 'som prognosen'
  return `${p} % ${skillnad > 0 ? 'fortare' : 'långsammare'} än prognosen`
}
