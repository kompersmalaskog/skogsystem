// TRÄFFSÄKERHET — hur nära prognoserna låg utfallet (2026-10-24, Martin: "hur bygger vi så man ser utfallet också, vad tog
// objektet mot prognosen Jocke sätter kontra den som appen räknar ut").
//
// Underlag: RPC prognos_facit() — en rad per AVSLUTAD virkestrakt med uppmätt G15 per roll (blev), planerarens prognos
// (objekt.manuell_prognos) och appens frysta prognos (objekt.app_prognos, fryst innan maskinen började; finns bara på trakter
// importerade från 2026-10-24). Allt i G15-timmar.
//
// Ren modell, inga sidoeffekter. Reglerna:
//   · Ett PAR = en trakt + en roll med utfall > 0 och minst en prognos. En roll utan utfall (skotaren på en trakt som inte skotats
//     än) räknas inte — prognos_facit tar bara avslutade trakter, men en skotning kan ha gått i Opti utan G15.
//   · Avvikelse = |blev − prognos| / prognos, som procent. "Inom N %" per källa = MEDIANEN över källans senaste SENASTE_N par
//     (medianen, så ett enda katastrofalt par inte avgör talet; 20 par så det följer med när prognoserna blir bättre).
//   · "Närmast" per par: den källa som ligger närmast blev i timmar; under en halvtimme är det lika. Räknas bara på par där BÅDA
//     källorna finns — annars jämför man äpplen med ingenting.
//   · Ett tal visas aldrig på färre än MIN_PAR par; därunder står antalet och "för få".
// Allt som sägs på sidan kommer ur `summering` och `rader`; sidan ritar bara.

export type FacitRad = {
  objekt_id: string
  namn: string
  typ: string | null
  klart: string | null
  skordare_g15: number | null
  skotare_g15: number | null
  manuell_prognos: unknown
  app_prognos: unknown
}

export type Roll = 'skordare' | 'skotare'
export type Kalla = 'planeraren' | 'appen'
export const ROLL_ORD: Record<Roll, string> = { skordare: 'Skördaren', skotare: 'Skotaren' }
export const KALLA_ORD: Record<Kalla, string> = { planeraren: 'Planeraren', appen: 'Appen' }

export const SENASTE_N = 20
export const MIN_PAR = 3
export const LIKA_TIM = 0.5

export type Par = {
  objekt_id: string
  namn: string
  typ: string | null
  klart: string | null
  roll: Roll
  blev: number
  planeraren: number | null
  appen: number | null
  /** |blev − prognos| / prognos per källa, andel (0,12 = 12 %). null utan prognos. */
  avvikelse: Record<Kalla, number | null>
  /** Vem som låg närmast när båda finns; 'lika' under LIKA_TIM; null när bara en finns. */
  narmast: Kalla | 'lika' | null
}

function prognosTim(raw: unknown, roll: Roll): number | null {
  if (!raw || typeof raw !== 'object') return null
  const v = Number(String((raw as Record<string, unknown>)[roll] ?? '').replace(',', '.'))
  return Number.isFinite(v) && v > 0 ? v : null
}

const tal = (v: unknown): number | null => { const n = Number(v); return v == null || !Number.isFinite(n) ? null : n }

/** Alla par ur facit-raderna, nyast avslutad först. */
export function byggPar(rader: FacitRad[]): Par[] {
  const ut: Par[] = []
  for (const r of rader) {
    for (const roll of ['skordare', 'skotare'] as const) {
      const blev = tal(roll === 'skordare' ? r.skordare_g15 : r.skotare_g15)
      if (blev == null || blev <= 0) continue
      const planeraren = prognosTim(r.manuell_prognos, roll)
      const appen = prognosTim(r.app_prognos, roll)
      if (planeraren == null && appen == null) continue
      const avv = (p: number | null) => (p == null ? null : Math.abs(blev - p) / p)
      let narmast: Par['narmast'] = null
      if (planeraren != null && appen != null) {
        const dP = Math.abs(blev - planeraren)
        const dA = Math.abs(blev - appen)
        narmast = Math.abs(dP - dA) < LIKA_TIM ? 'lika' : dA < dP ? 'appen' : 'planeraren'
      }
      ut.push({ objekt_id: r.objekt_id, namn: r.namn, typ: r.typ, klart: r.klart, roll, blev, planeraren, appen, avvikelse: { planeraren: avv(planeraren), appen: avv(appen) }, narmast })
    }
  }
  return ut.sort((a, b) => (b.klart ?? '').localeCompare(a.klart ?? ''))
}

export type KallaSumma = {
  kalla: Kalla
  /** Antal par källan har en prognos på (bland alla par). */
  antal: number
  /** Medianavvikelse i hela procent över de senaste SENASTE_N paren, eller null under MIN_PAR. */
  inomProcent: number | null
  /** Hur många av de parvisa jämförelserna källan låg närmast i. */
  narmast: number
}

export type Summering = {
  kallor: Record<Kalla, KallaSumma>
  /** Par där båda källorna finns (underlaget för "närmast"). */
  jamforda: number
  lika: number
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function summera(par: Par[]): Summering {
  const kallor = {} as Record<Kalla, KallaSumma>
  for (const k of ['planeraren', 'appen'] as const) {
    const med = par.filter(p => p.avvikelse[k] != null)
    const senaste = med.slice(0, SENASTE_N).map(p => p.avvikelse[k]!)
    kallor[k] = {
      kalla: k,
      antal: med.length,
      inomProcent: senaste.length >= MIN_PAR ? Math.round(median(senaste) * 100) : null,
      narmast: par.filter(p => p.narmast === k).length,
    }
  }
  const jamforda = par.filter(p => p.narmast != null).length
  return { kallor, jamforda, lika: par.filter(p => p.narmast === 'lika').length }
}

const tim = (n: number) => `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: n % 1 ? 1 : 0 }).format(n)} tim`

/** Rubrikraden för en källa: "Inom 12 % · 14 trakter" / "2 trakter – för få för ett tal" / "Inga trakter än". */
export function kallaText(s: KallaSumma): { tal: string; under: string } {
  if (s.antal === 0) return { tal: '–', under: 'Inga trakter än' }
  if (s.inomProcent == null) return { tal: '–', under: `${s.antal} ${s.antal === 1 ? 'trakt' : 'trakter'} – för få för ett tal` }
  const bas = Math.min(s.antal, SENASTE_N)
  return { tal: `inom ${s.inomProcent} %`, under: `på de senaste ${bas} trakterna` }
}

/** "Appen låg närmast 9 av 14 gånger · planeraren 4 · lika 1" — bara när något är jämfört. */
export function narmastText(s: Summering): string | null {
  if (s.jamforda === 0) return null
  const a = s.kallor.appen.narmast
  const p = s.kallor.planeraren.narmast
  const forst: Kalla = a >= p ? 'appen' : 'planeraren'
  const andra: Kalla = forst === 'appen' ? 'planeraren' : 'appen'
  const delar = [`${KALLA_ORD[forst]} låg närmast ${s.kallor[forst].narmast} av ${s.jamforda} gånger`, `${andra} ${s.kallor[andra].narmast}`]
  if (s.lika > 0) delar.push(`lika ${s.lika}`)
  return delar.join(' · ')
}

/** Radens text för ett par: "Skördaren blev 52 tim · planeraren 56 · appen 48". Saknad källa skrivs inte alls (ingen "–" att missförstå). */
export function parText(p: Par): string {
  const delar = [`${ROLL_ORD[p.roll]} blev ${tim(p.blev)}`]
  if (p.planeraren != null) delar.push(`planeraren ${tim(p.planeraren)}`)
  if (p.appen != null) delar.push(`appen ${tim(p.appen)}`)
  return delar.join(' · ')
}

/** Vem som låg närmast, i ord, för raden; null när inget går att jämföra. */
export function parNarmastText(p: Par): string | null {
  if (p.narmast == null) return null
  return p.narmast === 'lika' ? 'lika nära' : `${p.narmast} låg närmast`
}

export type Ordning = 'senaste' | 'skillnad'

/** Största skillnad = största avvikelse hos någon källa. */
export function ordna(par: Par[], ordning: Ordning): Par[] {
  if (ordning === 'senaste') return par
  const max = (p: Par) => Math.max(p.avvikelse.planeraren ?? 0, p.avvikelse.appen ?? 0)
  return [...par].sort((a, b) => max(b) - max(a))
}

/** Trakterna grupperade (en trakt, en eller två roll-rader), i vald ordning. */
export function grupperaTrakter(par: Par[]): { objekt_id: string; namn: string; klart: string | null; par: Par[] }[] {
  const ut: { objekt_id: string; namn: string; klart: string | null; par: Par[] }[] = []
  for (const p of par) {
    const g = ut.find(x => x.objekt_id === p.objekt_id)
    if (g) g.par.push(p)
    else ut.push({ objekt_id: p.objekt_id, namn: p.namn, klart: p.klart, par: [p] })
  }
  return ut
}
