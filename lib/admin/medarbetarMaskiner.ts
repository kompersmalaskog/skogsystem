/**
 * Admin › Medarbetare: vilka maskiner en person står på, i ord (2026-11-25, Martin: "så enkelt att ett barn förstår direkt").
 *
 * - Bara maskiner i drift visas. En såld maskin (aktiv_till före idag) är historik och står inte på raden.
 * - Står personen på alla maskiner i drift (och de är fler än en) står det "Alla maskiner" i stället för en uppräkning.
 * - Maskinvalet på personsidan visar bara namnet (aldrig serienumret), maskiner i drift, och den maskin personen har idag
 *   även om den gått ur drift — så att ett sparat val aldrig försvinner ur listan.
 */

export type MaskinDrift = { maskin_id: string; aktiv_till?: string | null }

/** Maskiner i drift: utan aktiv_till, eller med aktiv_till idag eller senare. `idag` = 'YYYY-MM-DD' (lokalt). */
export function maskinerIDrift(rader: MaskinDrift[], idag: string): Set<string> {
  const ut = new Set<string>()
  for (const r of rader) {
    const till = (r.aktiv_till || '').slice(0, 10)
    if (!till || till >= idag) ut.add(r.maskin_id)
  }
  return ut
}

/** Raden under namnet: maskinerna i drift personen står på, eller "Alla maskiner". Tom sträng = ingen maskin. */
export function maskinRadText(ids: Iterable<string>, namn: Record<string, string>, iDrift: Set<string>): string {
  const mina = new Set<string>()
  for (const id of ids) if (iDrift.has(id)) mina.add(id)
  if (mina.size === 0) return ''
  if (iDrift.size > 1 && Array.from(iDrift).every(id => mina.has(id))) return 'Alla maskiner'
  return Array.from(mina).map(id => namn[id] || id).sort((a, b) => a.localeCompare(b, 'sv')).join(', ')
}

/** Valen i "Maskin": Ingen maskin, sedan maskinerna i drift efter namn, och den valda om den gått ur drift. Bara namn. */
export function maskinVal(namn: Record<string, string>, iDrift: Set<string>, vald: string): { value: string; label: string }[] {
  const ids = Object.keys(namn).filter(id => iDrift.has(id) || id === vald)
  return [
    { value: '', label: 'Ingen maskin' },
    ...ids.map(id => ({ value: id, label: iDrift.has(id) ? namn[id] : `${namn[id]} (ur drift)` }))
      .sort((a, b) => a.label.localeCompare(b.label, 'sv')),
  ]
}

/** Operatörens rad under namnet: "Elefant AF · profil 1". Profilnumret är det efter sista understrecket i operator_id. */
export function operatorDetalj(operatorId: string, maskinNamn: string | null): string {
  const m = /_(\d+)$/.exec(operatorId)
  const profil = m ? `profil ${m[1]}` : null
  return [maskinNamn, profil].filter(Boolean).join(' · ')
}
