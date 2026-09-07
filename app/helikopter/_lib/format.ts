// Formatering för /helikopter: tal i m³fub, datum, relativ tid.

export const MANAD_NAMN = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']
const MANAD_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

/** Heltal med svensk tusentalsavgränsare (icke-brytande mellanslag). */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString('sv-SE')
}

export function manadRubrik(ar: number, manad: number): string {
  const namn = MANAD_NAMN[manad - 1] ?? ''
  return `${namn.charAt(0).toUpperCase()}${namn.slice(1)} ${ar}`
}

/** "2026-10-24" → "24 okt" */
export function fmtDag(iso: string | null | undefined): string {
  if (!iso) return ''
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MANAD_KORT[m - 1] ?? ''}`
}

/** Relativ tid för "senaste data": "i dag 14:20", "i går kväll", "för 3 dagar sedan", "24 aug". */
export function relativTid(iso: string | null, nu: Date = new Date()): string {
  if (!iso) return 'ingen data'
  const t = new Date(iso)
  if (isNaN(t.getTime())) return ''
  const dagNyckel = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  const igar = new Date(nu); igar.setDate(nu.getDate() - 1)
  const hh = String(t.getHours()).padStart(2, '0')
  const mm = String(t.getMinutes()).padStart(2, '0')
  if (dagNyckel(t) === dagNyckel(nu)) return `i dag ${hh}:${mm}`
  if (dagNyckel(t) === dagNyckel(igar)) {
    const h = t.getHours()
    const del = h < 10 ? 'morse' : h < 12 ? 'förmiddag' : h < 18 ? 'eftermiddag' : 'kväll'
    return `i går ${del}`
  }
  const dagar = Math.round((nu.getTime() - t.getTime()) / 86400000)
  if (dagar >= 0 && dagar <= 6) return `för ${dagar} dagar sedan`
  return `${t.getDate()} ${MANAD_KORT[t.getMonth()]}`
}

export function dagarText(n: number): string {
  return `${n} ${n === 1 ? 'dag' : 'dagar'}`
}
