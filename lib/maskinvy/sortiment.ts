// Sortimentfördelningen i maskinvyns Översikt: hur en maskins volym fördelar sig på timmer, kubb, massaved och övrigt.
//
// GRUPPEN KOMMER ALLTID UR `vy_sortiment_klass` — aldrig ur `dim_sortiment_grupp` direkt (vyn är projektets enda
// läsordning: filens produktgrupp → dim_sortiment_grupp → namnet; "upprepa aldrig COALESCE-kedjan"). Tabellen fylls
// inte av någon trigger och saknar rad för varje nytt sortiment: 2026-10-21 hade 40 av 300 sortiment ingen rad och 24
// en tom grupp, och Scorpions oktober hade 228,6 m³ på 11 sortiment utan rad — som såg ut som "okänd" tills man
// läste vyn, där filens egen produktgrupp bär alla 3 477,7 m³. Vakt: `sortiment.vakt.test.ts`.
//
// Fyra klasser, samma som Affärsuppföljningen ("Vad posterna består av"): Timmer · Kubb (kubb och klentimmer,
// klentimmer går till såg som kubb) · Massaved · Övrigt (energived, avkap, hemved och osorterat).
// Volymen är m³fub (volym_m3sub), skördarmätt.

import { SORTIMENT, heltalTill100, type Andelar, type Sortiment } from '@/lib/medelstam/berakna'

/** Värdena `vy_sortiment_klass.grupp` kan ha → sortimentklass. Allt som inte står här hamnar i Övrigt och RAPPORTERAS. */
export const GRUPP_TILL_SORTIMENT: Readonly<Record<string, Sortiment>> = {
  Timmer: 'timmer',
  Kubb: 'kubb',
  Klentimmer: 'kubb',
  Massa: 'massa',
  Energi: 'ovrigt',
  Hemved: 'ovrigt',
  'Övrigt': 'ovrigt',
  'Utan sortiment': 'ovrigt',
}

/** En rad under klassens namn — det som inte säger sig självt. */
export const SORTIMENT_BESKRIVNING: Readonly<Partial<Record<Sortiment, string>>> = {
  kubb: 'kubb och klentimmer',
  ovrigt: 'energived, avkap, hemved och osorterat',
}

export type SortimentRad = { sortiment_id: string | null; volym_m3sub: number | null }

export type Fordelning = {
  /** Summan av alla rader, m³fub. */
  total: number
  volym: Record<Sortiment, number>
  /** Andel 0–100 (decimaler) per klass — stapelns bredd. */
  andel: Andelar
  /** Hela procent som summerar till exakt 100 — det som skrivs ut. */
  hela: Andelar
  /** m³ på sortiment vars grupp saknades i vyn (eller var NULL). De ligger i Övrigt men sägs. */
  utanGrupp: number
  /** Gruppnamn vyn gav som vi inte känner igen (ligger i Övrigt). Tom i normalfallet. */
  okandaGrupper: string[]
}

const noll = (): Record<Sortiment, number> => ({ timmer: 0, kubb: 0, massa: 0, ovrigt: 0 })

export function sortimentFordelning(rader: SortimentRad[], gruppAv: ReadonlyMap<string, string | null>): Fordelning {
  const volym = noll()
  let utanGrupp = 0
  const okanda = new Set<string>()
  for (const r of rader) {
    const v = r.volym_m3sub ?? 0
    if (!v) continue
    const grupp = r.sortiment_id ? gruppAv.get(r.sortiment_id) ?? null : null
    const klass = grupp ? GRUPP_TILL_SORTIMENT[grupp] : undefined
    if (klass) { volym[klass] += v; continue }
    volym.ovrigt += v
    if (grupp) okanda.add(grupp)
    else utanGrupp += v
  }
  const total = SORTIMENT.reduce((s, k) => s + volym[k], 0)
  const andel = Object.fromEntries(SORTIMENT.map(k => [k, total > 0 ? (100 * volym[k]) / total : 0])) as Andelar
  const hela = total > 0 ? heltalTill100(andel) : (Object.fromEntries(SORTIMENT.map(k => [k, 0])) as Andelar)
  return { total, volym, andel, hela, utanGrupp, okandaGrupper: Array.from(okanda).sort() }
}

/** Sortimentfilerna och produktionen mäts var för sig och skiljer några promille (Scorpion okt: 3 477,7 mot 3 474,0 m³).
 *  Skiljer de ≥ 1 % ska det stå; under det är det brus och kortet skriver inget. */
export const AVVIKELSE_VISA_PROCENT = 1

export function avvikelseMotProduktion(sortimentTotal: number, produktionsvolym: number | null | undefined): { sortiment: number; produktion: number } | null {
  if (!produktionsvolym || produktionsvolym <= 0 || sortimentTotal <= 0) return null
  const pct = (100 * Math.abs(sortimentTotal - produktionsvolym)) / produktionsvolym
  return pct >= AVVIKELSE_VISA_PROCENT ? { sortiment: sortimentTotal, produktion: produktionsvolym } : null
}
