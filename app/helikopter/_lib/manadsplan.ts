// Månadsplan (A4): modellen som sidan, PDF:en och bilden ritas ur. Allt är redan räknat (klar.ts) — här görs det till rader och text.
// Samma innehåll som Planering: svarsrad, mot beställning, maskiner med klar-datum, och vad som återstår att göra.
import type { RutnatSegment } from '@/components/design/Rutnat'
import { TYP_NAMN } from './berakningar'
import { MANAD_NAMN, fmt, kortNamn } from './format'
import {
  bastaFlytt, bestamdNamn, dagarSaknas, flyttText, klarSvar, maskinHoger, raknaAlla, saknarPrognos, saknarTrakt,
  type KlarData, type KlarSvar,
} from './klar'
import { maskinSegment, rutnatDagar } from './klarRutnat'
import type { Typ } from './queries'

export type PlanTon = 'normal' | 'orange' | 'muted'

export type PlanTrakt = { namn: string; volymText: string; saknarPrognos: boolean }
export type PlanSpar = {
  typ: Typ
  namn: string
  /** "5 240 av 5 000" — eller bara talet när beställning saknas. */
  summaText: string
  /** 0–1; null = ingen mätare (ingen beställning). */
  andel: number | null
  orange: boolean
  trakter: PlanTrakt[]
  /** "380 m³fub saknar trakt" — sista raden när trakterna inte täcker beställningen. */
  saknasText: string | null
}
export type PlanMaskin = { id: string; namn: string; klar: { text: string; ton: PlanTon }; segment: RutnatSegment[] }

export type PlanModell = {
  ar: number
  manad: number
  /** "November 2026" */
  rubrik: string
  /** "Plan · 17 oktober · Kompersmåla Skog" */
  undertitel: string
  filnamn: string
  svar: Pick<KlarSvar, 'rubrik' | 'rad' | 'avvikelse'>
  spar: PlanSpar[]
  dagar: string[]
  idagIso: string
  sistaArbetsdag: string
  maskiner: PlanMaskin[]
  attGora: string[]
  sidfot: string
}

const capital = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`

/** "2026-10-17" → "17 oktober". */
export function datumLang(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MANAD_NAMN[m - 1] ?? ''}`
}

export function planModell(d: KlarData, opt: { idag: string }): PlanModell {
  const planer = raknaAlla(d)
  const svar = klarSvar(d, null)
  const manadNamn = MANAD_NAMN[d.manad - 1] ?? ''

  const spar: PlanSpar[] = d.spar.map(s => {
    const harBest = s.bestallt > 0
    const saknas = saknarTrakt(s)
    return {
      typ: s.typ,
      namn: TYP_NAMN[s.typ],
      summaText: harBest ? `${fmt(s.trakt_volym)} av ${fmt(s.bestallt)}` : fmt(s.trakt_volym),
      andel: harBest ? Math.min(s.trakt_volym / s.bestallt, 1) : null,
      orange: harBest && s.trakt_volym < s.bestallt,
      // Förra månadens trakt: volymen är det som är kvar att skörda (0 = skördad, skotningen återstår). Månadens egen utan volym: saknas.
      trakter: s.trakter.map(t => ({ namn: kortNamn(t.namn), volymText: t.volym > 0 || t.forra_manaden ? fmt(t.volym) : 'volym saknas', saknarPrognos: t.saknar_prognos })),
      saknasText: harBest && saknas > 0 ? `${fmt(saknas)} m³fub saknar trakt` : null,
    }
  })

  const maskiner: PlanMaskin[] = d.maskiner.map(m => {
    const p = planer[m.maskin_id]
    const h = maskinHoger(p)
    return { id: m.maskin_id, namn: m.namn, klar: { text: h.text, ton: h.ton }, segment: maskinSegment(m, p, d.sista_arbetsdag) }
  })

  // ATT GÖRA — en kort rad vardera.
  const attGora: string[] = []
  const flytt = bastaFlytt(d)
  if (flytt) attGora.push(flyttText(flytt))
  else {
    for (const p of Object.values(planer)) {
      if (p.efterManad) attGora.push(`${bestamdNamn(p.maskin.namn)}: ${dagarSaknas(p, d.sista_arbetsdag)} dagar saknas`)
    }
  }
  const utan = saknarPrognos(d)
  if (utan.length === 1) attGora.push(`${kortNamn(utan[0].namn)} saknar prognos`)
  else if (utan.length > 1) attGora.push(`${utan.length} trakter saknar prognos: ${utan.map(t => kortNamn(t.namn)).join(', ')}`)
  for (const s of spar) if (s.saknasText) attGora.push(`${s.namn}: ${s.saknasText}`)

  return {
    ar: d.ar,
    manad: d.manad,
    rubrik: `${capital(manadNamn)} ${d.ar}`,
    undertitel: `Plan · ${datumLang(opt.idag)} · Kompersmåla Skog`,
    filnamn: `manadsplan-${d.ar}-${String(d.manad).padStart(2, '0')}`,
    svar: { rubrik: svar.rubrik, rad: svar.rad, avvikelse: svar.avvikelse },
    spar,
    dagar: rutnatDagar(d, planer),
    idagIso: opt.idag,
    sistaArbetsdag: d.sista_arbetsdag,
    maskiner,
    attGora,
    sidfot: 'Prognos per trakt ur planeringsverktyget · dagar = uppmätt G15 per arbetsdag, 12 mån · ledighet borträknad',
  }
}

