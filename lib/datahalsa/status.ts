// Statusraderna i meta_datahalsa_status — en rad per kontroll, två skribenter:
//
//   'import_live'  DATABASEN: pg_cron-jobbet 'import-larm' kör import_larm_kontroll() var 15:e minut.
//                  Svarar på "fungerar importen just nu?" och står överst på Datahälsa.
//   övriga rader   IMPORTDATORN: gap_check.py. Kontroller som bara den kan göra (filerna i Behandlade
//                  och Inkommande, koden som kör). Samlingsraden 'gap_check' skrivs inte längre.
//
// Här finns ALL text och alla regler för hur raderna visas; komponenterna ritar bara.
// Rena funktioner: tiden kommer in som argument, så samma rad ger samma svar i test och i vyn.

export type StatusRad = {
  id: string
  kordTid: string | null         // ISO
  status: string                 // 'OK' | 'LARM' | 'OKÄND' …
  larmAntal: number
  sammanfattning: string | null
}

export const IMPORT_LIVE = 'import_live'
/** Samlingsraden som gap_check.py skrev förr. Visas aldrig, också om den ligger kvar i tabellen. */
export const GAMMAL_SAMLINGSRAD = 'gap_check'

/** Jobbet går var 15:e minut. Tre missade körningar = kontrollen står still, och då är ett grönt svar inte längre sant. */
export const IMPORT_LIVE_GAMMAL_MIN = 45

export type ImportLiveLage = 'ok' | 'larm' | 'gammal' | 'okand' | 'saknas'

export type ImportLiveVy = {
  lage: ImportLiveLage
  /** Svaret i ord. Färgen förstärker bara. */
  rubrik: string
  /** Under rubriken: vid larm en rad per problem, annars högst en förklarande rad. */
  rader: string[]
  /** "Senast kontrollerad 11:00" — null när ingen kontroll finns. */
  kontrollerad: string | null
  /** Sann när kontrollen är äldre än IMPORT_LIVE_GAMMAL_MIN (texten ska då sticka ut). */
  kontrollGammal: boolean
}

const MANADER = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

/** Datum och klockslag i svensk tid, oavsett enhetens tidszon. */
function svenskTid(ms: number): { dag: string; kl: string } {
  const delar = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(ms))
  const v = (typ: string) => delar.find((d) => d.type === typ)?.value ?? ''
  return { dag: `${v('year')}-${v('month')}-${v('day')}`, kl: `${v('hour')}:${v('minute')}` }
}

/** "11:00" samma dag, "i går 16:09" dagen före, annars "22 nov 20:02". */
export function narText(iso: string | null, nu: number): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const t = svenskTid(ms)
  if (t.dag === svenskTid(nu).dag) return t.kl
  if (t.dag === svenskTid(nu - 86_400_000).dag) return `i går ${t.kl}`
  return `${Number(t.dag.slice(8, 10))} ${MANADER[Number(t.dag.slice(5, 7)) - 1]} ${t.kl}`
}

/**
 * Sammanfattningen som rader: en rad per problem, i den ordning de står.
 * Ordet LARM och punkttecken först på raden tas bort (raden står redan under en röd rubrik), tomma rader och dubbletter likaså.
 */
export function problemRader(sammanfattning: string | null | undefined): string[] {
  const ut: string[] = []
  for (const r of String(sammanfattning ?? '').split(/\r?\n/)) {
    const rad = r.trim().replace(/^(?:[-•*·]\s*)?(?:LARM\b[\s:–—-]*)?/, '').trim()
    if (rad && !ut.includes(rad)) ut.push(rad)
  }
  return ut
}

const OK_RUBRIK = 'Importen fungerar'

export function importLiveVy(rad: StatusRad | null, nu: number): ImportLiveVy {
  if (!rad) {
    return {
      lage: 'saknas', rubrik: 'Importen har inte kontrollerats än',
      rader: ['Kontrollen körs i databasen var 15:e minut. Första svaret kommer inom en kvart.'],
      kontrollerad: null, kontrollGammal: false,
    }
  }
  const ms = rad.kordTid ? Date.parse(rad.kordTid) : NaN
  const gammal = !Number.isFinite(ms) || nu - ms > IMPORT_LIVE_GAMMAL_MIN * 60_000
  const nar = narText(rad.kordTid, nu)
  const kontrollerad = nar ? `Senast kontrollerad ${nar}` : null
  const rader = problemRader(rad.sammanfattning)

  if (rad.status === 'LARM') {
    // Ett larm står kvar också när kontrollen blivit gammal: det senaste vi vet är att något var fel.
    return {
      lage: 'larm', rubrik: 'Importen felar',
      rader: rader.length > 0 ? rader : ['Kontrollen larmar men säger inte varför.'],
      kontrollerad, kontrollGammal: gammal,
    }
  }
  if (gammal) {
    // Aldrig grönt på en kontroll som slutat köra — "fungerar" vore då en gissning.
    return {
      lage: 'gammal', rubrik: 'Importen kontrolleras inte',
      rader: ['Kontrollen ska köra var 15:e minut men har stannat.'],
      kontrollerad, kontrollGammal: true,
    }
  }
  if (rad.status === 'OK') {
    // Databasens text börjar med samma ord som rubriken ("Importen fungerar. Senaste fil …") — säg det en gång.
    const resten = rader.map((r) => r.replace(/^Importen fungerar\.?\s*/i, '').trim()).filter(Boolean)
    return { lage: 'ok', rubrik: OK_RUBRIK, rader: resten, kontrollerad, kontrollGammal: false }
  }
  return { lage: 'okand', rubrik: 'Importen kunde inte kontrolleras', rader, kontrollerad, kontrollGammal: false }
}

// ── Kontrollerna från importdatorn ──

/** Namn i klartext och fast ordning. En rad med okänt id visas sist under sitt id, så en ny kontroll syns utan kodändring. */
export const KONTROLLER: readonly { id: string; namn: string }[] = [
  { id: 'fakt_tid_mot_mom', namn: 'Maskintid mot maskinfilerna' },
  { id: 'stammar_utan_stockar', namn: 'Stammar utan stockar' },
  { id: 'fakt_sortiment_mot_stock', namn: 'Sortiment mot stockarna' },
  { id: 'inkommande_ko', namn: 'Kön i Inkommande' },
  { id: 'parkerade_filer', namn: 'Parkerade filer' },
  { id: 'deploy_drift', namn: 'Importkoden på datorn' },
]

export type KontrollLage = 'ok' | 'larm' | 'okand'
export type KontrollVy = { id: string; namn: string; lage: KontrollLage; larmAntal: number; rader: string[] }

const kontrollLage = (status: string): KontrollLage => (status === 'OK' ? 'ok' : status === 'LARM' ? 'larm' : 'okand')

/** Importdatorns kontroller i fast ordning. import_live och den gamla samlingsraden hör inte hit. */
export function kontrollRader(alla: readonly StatusRad[]): KontrollVy[] {
  const kvar = alla.filter((r) => r.id !== IMPORT_LIVE && r.id !== GAMMAL_SAMLINGSRAD)
  const kanda = KONTROLLER.flatMap((k) => {
    const rad = kvar.find((r) => r.id === k.id)
    return rad ? [{ rad, namn: k.namn }] : []
  })
  const okanda = kvar.filter((r) => !KONTROLLER.some((k) => k.id === r.id)).sort((a, b) => a.id.localeCompare(b.id)).map((rad) => ({ rad, namn: rad.id }))
  return [...kanda, ...okanda].map(({ rad, namn }) => {
    const lage = kontrollLage(rad.status)
    return { id: rad.id, namn, lage, larmAntal: rad.larmAntal, rader: lage === 'ok' ? [] : problemRader(rad.sammanfattning) }
  })
}

/** Senaste körningen bland importdatorns kontroller (de skrivs i samma körning). */
export function kontrollerSenastKord(alla: readonly StatusRad[]): string | null {
  let bast: string | null = null
  for (const r of alla) {
    if (r.id === IMPORT_LIVE || r.id === GAMMAL_SAMLINGSRAD || !r.kordTid) continue
    if (!bast || Date.parse(r.kordTid) > Date.parse(bast)) bast = r.kordTid
  }
  return bast
}

/** Punkterna som statusraderna ger i Datahälsas besked (samma på vyn och på startsidan). */
export function statusPunkter(alla: readonly StatusRad[], nu: number): string[] {
  const punkter: string[] = []
  const live = alla.find((r) => r.id === IMPORT_LIVE) ?? null
  if (live) {
    const vy = importLiveVy(live, nu)
    if (vy.lage === 'larm') punkter.push(vy.rader.length === 1 ? `Importen felar: ${vy.rader[0]}` : `Importen felar (${vy.rader.length} problem)`)
    else if (vy.lage === 'gammal') punkter.push(`Importen kontrolleras inte — ${(vy.kontrollerad ?? 'ingen kontroll').replace(/^S/, 's')}`)
  }
  for (const k of kontrollRader(alla)) {
    if (k.lage === 'larm') punkter.push(`${k.namn}: ${k.larmAntal > 1 ? `${k.larmAntal} larm` : 'larm'}`)
  }
  return punkter
}
