/**
 * Snitt per dag — EN regel för hela uppföljningen (svaret, maskinkorten,
 * risjobbets rubrik och "Produktion per dag").
 *
 * Bara dagar med volym räknas: en dag utan m³ (flytt, ett lass utan mätt
 * volym, en rad med 0) är ingen produktionsdag och får inte dra ned snittet.
 * Inga sådana dagar = null, aldrig 0.
 *
 * Returnerar det oavrundade snittet; vyn avrundar när den visar talet.
 */
export function snittPerDag(dagar: readonly { m3?: number | null }[] | null | undefined): number | null {
  if (!dagar) return null
  let summa = 0
  let antal = 0
  for (const d of dagar) {
    const m3 = d.m3
    if (typeof m3 !== 'number' || !Number.isFinite(m3) || m3 <= 0) continue
    summa += m3
    antal += 1
  }
  return antal > 0 ? summa / antal : null
}

/** Samma regel, avrundat till hela m³ — det som står på skärmen. */
export function snittPerDagHel(dagar: readonly { m3?: number | null }[] | null | undefined): number | null {
  const s = snittPerDag(dagar)
  return s == null ? null : Math.round(s)
}
