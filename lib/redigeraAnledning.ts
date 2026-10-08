// Anledningen till en ändring i Redigera måste vara en anledning (Martin 2026-10-08).
//
// Fältet godtog vad som helst som inte var tomt: 11 av 84 redigerade dagar i prod har anledningen "." (alla sedan
// 2026-09-08). Regeln: minst 3 tecken efter trim och minst en bokstav eller siffra. Gäller BARA anledningen i Redigera —
// km-bladet och "Det var fel — använd maskinens tider" kräver ingen anledning och rörs inte.

export const ANLEDNING_MIN_TECKEN = 3

export function anledningGiltig(anledning: string | null | undefined): boolean {
  const t = String(anledning ?? "").trim()
  // Bokstav = tecken där versal och gemen skiljer sig (fungerar för å, ä, ö, é …); siffra = 0–9. Inget /u-flagga: målet är ES5.
  const harBokstavEllerSiffra = t.split("").some(c => /[0-9]/.test(c) || c.toLowerCase() !== c.toUpperCase())
  return t.length >= ANLEDNING_MIN_TECKEN && harBokstavEllerSiffra
}
