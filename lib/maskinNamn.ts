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
