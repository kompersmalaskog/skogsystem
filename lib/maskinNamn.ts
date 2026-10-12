// Ett maskinnamn i hela appen.
//
// Ordning: dim_maskin.visningsnamn (admin-satt, importen rör det aldrig) →
// tillverkare + modell ur filen (dubbelt prefix strippat) → maskin_id.
// Använd den här överallt där en maskin visas för användaren. Admin-formuläret
// och importloggen får visa modell bredvid, ingen annan.

export type MaskinNamnKalla = {
  maskin_id: string
  visningsnamn?: string | null
  modell?: string | null
  tillverkare?: string | null
}

export function maskinVisningsnamn(m: MaskinNamnKalla | null | undefined): string {
  if (!m) return ''
  const v = (m.visningsnamn ?? '').trim()
  if (v) return v
  const t = (m.tillverkare ?? '').trim()
  const mod = (m.modell ?? '').trim()
  if (!t && !mod) return m.maskin_id
  if (!t) return mod
  if (!mod) return t
  if (mod.toLowerCase().startsWith(t.toLowerCase())) return mod
  return `${t} ${mod}`
}

// Tabellen `maskiner` bär BARA service-loggens nyckel (maskin_service.maskin_id =
// maskiner.id) och aktiv-flaggan för service-listan. Läs aldrig namn eller typ
// därifrån: 2026-10-02 satte Martin namn i `maskiner` och ingen vy ändrades, för
// vyerna läser dim_maskin. En tabell för namnet, en för typen — dim_maskin.

/** Kolumner att hämta ur dim_maskin för namn + slag. */
export const DIM_MASKIN_NAMN_KOLUMNER = 'maskin_id, visningsnamn, modell, tillverkare, maskin_typ'

/** dim_maskin.maskin_typ (StanForD: 'Harvester'/'Forwarder'/'Okänd') → 'skordare'/'skotare',
 *  annars null (otypad maskin = ingen premie, ingen gissning — lönemotorn säger det högt). */
export function maskinSlag(maskinTyp: string | null | undefined): 'skordare' | 'skotare' | null {
  const t = (maskinTyp ?? '').toLowerCase()
  if (t === 'harvester' || t.includes('skörd') || t.includes('skord')) return 'skordare'
  if (t === 'forwarder' || t.includes('skot')) return 'skotare'
  return null
}

/** {maskin_id: visningsnamn} ur en dim_maskin-lista. */
export function maskinNamnMap(rader: MaskinNamnKalla[] | null | undefined): Record<string, string> {
  const ut: Record<string, string> = {}
  for (const m of rader ?? []) if (m.maskin_id) ut[m.maskin_id] = maskinVisningsnamn(m)
  return ut
}
