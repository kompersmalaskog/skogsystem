// Månadsfacit och historik — payloaden ur helikopter_manadsfacit / helikopter_historik (migration 20261016090000) och den rena
// vymodellen som sidan /helikopter/manad, historikfliken, PDF:en, bilden och månadsnotisen bygger på. Inga imports av React eller
// Supabase; testad i manadsfacit.test.ts.
//
// Reglerna (procent, klart_datum, skotat_fran_tidigare) finns i SQL; här finns samma regler som rena funktioner så att de går att
// pröva mot fixturer och mot SQL:ens svar. Avrundning: delarna avrundas först, summan är summan av de avrundade delarna, procent räknas
// på de avrundade talen — det som står på sidan går att kontrollräkna med miniräknare.
import { TYP_NAMN } from './berakningar'
import { MANAD_NAMN, fmt, fmtDag, manadRubrik } from './format'
import type { Typ } from './queries'

// ── Payloaden ur SQL ────────────────────────────────────────────────────────
export type FacitVecka = { iso_ar: number; isovecka: number; arbetsdagar: number; plan: number | null; skordat: number; skotat: number }
export type FacitSpar = {
  bestallt: number
  bolag: string[]
  skordat: number
  skotat: number
  /** Skotat i månaden på objekt vars skördning avslutades före månaden. */
  skotat_fran_tidigare: number
  /** Samma volym fördelad på månaden skördningen avslutades i, nyaste först. */
  tidigare_manader: { ar: number; manad: number; volym: number }[]
  procent: number
  /** Första dagen då ackumulerat skotat nådde beställt; null = nåddes inte. */
  klart_datum: string | null
  veckor: FacitVecka[]
}
export type FacitStatus = 'avslutad' | 'pagaende' | 'kommande'
export type FacitTotalt = { bestallt: number; skordat: number; skotat: number; procent: number; maskiner: number; arbetsdagar: number }
export type Manadsfacit = { ar: number; manad: number; status: FacitStatus; spar: Record<Typ, FacitSpar | null>; totalt: FacitTotalt | null }

export type HistorikManad = { ar: number; manad: number; bestallt: number; skotat: number; procent: number; slutavverkning: number | null; gallring: number | null }
export type Historik = { manader: HistorikManad[]; snitt_6m: number | null; antal_6m: number; inom_5_6m: number }

/** Spårens ordning på sidan och i PDF:en. */
export const FACIT_ORDNING: Typ[] = ['slutavverkning', 'gallring']

// ── Läs payloaden (defensivt: ett konstigt svar är ett fel, aldrig 0) ───────
const tal = (v: unknown): number => {
  const n = Number(v)
  if (v == null || !Number.isFinite(n)) throw new Error('Ogiltigt tal i månadsfacit')
  return n
}
const talEllerNull = (v: unknown): number | null => (v == null ? null : tal(v))

function lasVecka(v: any): FacitVecka {
  return { iso_ar: tal(v.iso_ar), isovecka: tal(v.isovecka), arbetsdagar: tal(v.arbetsdagar), plan: talEllerNull(v.plan), skordat: tal(v.skordat), skotat: tal(v.skotat) }
}
function lasSpar(s: any): FacitSpar | null {
  if (s == null) return null
  return {
    bestallt: tal(s.bestallt),
    bolag: Array.isArray(s.bolag) ? s.bolag.map(String) : [],
    skordat: tal(s.skordat),
    skotat: tal(s.skotat),
    skotat_fran_tidigare: tal(s.skotat_fran_tidigare ?? 0),
    tidigare_manader: Array.isArray(s.tidigare_manader) ? s.tidigare_manader.map((t: any) => ({ ar: tal(t.ar), manad: tal(t.manad), volym: tal(t.volym) })) : [],
    procent: tal(s.procent),
    klart_datum: typeof s.klart_datum === 'string' ? s.klart_datum.slice(0, 10) : null,
    veckor: Array.isArray(s.veckor) ? s.veckor.map(lasVecka) : [],
  }
}

/** Kastar vid ett svar som inte är ett facit — anroparen gör det till ett fel. */
export function lasManadsfacit(raw: unknown): Manadsfacit {
  const r = raw as any
  if (!r || typeof r !== 'object' || !r.spar || typeof r.spar !== 'object') throw new Error('Tomt svar från helikopter_manadsfacit')
  const status: FacitStatus = r.status === 'avslutad' || r.status === 'kommande' ? r.status : 'pagaende'
  const t = r.totalt
  return {
    ar: tal(r.ar),
    manad: tal(r.manad),
    status,
    spar: { slutavverkning: lasSpar(r.spar.slutavverkning), gallring: lasSpar(r.spar.gallring) },
    totalt: t == null ? null : { bestallt: tal(t.bestallt), skordat: tal(t.skordat), skotat: tal(t.skotat), procent: tal(t.procent), maskiner: tal(t.maskiner), arbetsdagar: tal(t.arbetsdagar) },
  }
}

export function lasHistorik(raw: unknown): Historik {
  const r = raw as any
  if (!r || typeof r !== 'object' || !Array.isArray(r.manader)) throw new Error('Tomt svar från helikopter_historik')
  return {
    manader: r.manader.map((m: any) => ({
      ar: tal(m.ar), manad: tal(m.manad), bestallt: tal(m.bestallt), skotat: tal(m.skotat), procent: tal(m.procent),
      slutavverkning: talEllerNull(m.slutavverkning), gallring: talEllerNull(m.gallring),
    })),
    snitt_6m: talEllerNull(r.snitt_6m),
    antal_6m: tal(r.antal_6m ?? 0),
    inom_5_6m: tal(r.inom_5_6m ?? 0),
  }
}

// ── Reglerna som rena funktioner (spegel av SQL) ────────────────────────────
/** Skotat mot beställt i hela procent; null utan beställning (aldrig 0 %). */
export function procent(skotat: number, bestallt: number): number | null {
  return bestallt > 0 ? Math.round((100 * skotat) / bestallt) : null
}

/** Första dagen då ACKUMULERAT skotat (från månadens första dag) nådde beställt; null = nåddes inte. Dagar utan lass ändrar inget. */
export function klartDatum(dagvolymer: { datum: string; volym: number }[], bestallt: number): string | null {
  if (bestallt <= 0) return null
  let kum = 0
  for (const d of [...dagvolymer].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0))) {
    kum += d.volym
    if (kum >= bestallt) return d.datum
  }
  return null
}

/** Skotat i månaden på objekt vars skördning avslutades FÖRE månaden. Objekt utan skördningsdatum räknas inte hit. */
export function skotatFranTidigare(lass: { volym: number; skordning_avslutad: string | null }[], manadStart: string): number {
  return lass.reduce((s, l) => (l.skordning_avslutad != null && l.skordning_avslutad.slice(0, 10) < manadStart ? s + l.volym : s), 0)
}

/** Procent <95 är dämpad rad i historiken; 95 och över i full text. */
export function radDampad(p: number): boolean {
  return p < 95
}

/** "inom ±5 %": |procent − 100| ≤ 5. */
export function inomMarginal(p: number): boolean {
  return Math.abs(p - 100) <= 5
}

const MANAD_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

/** " till Vida" · "Vida och Södra" — utan inledande "till". */
export function bolagLista(bolag: string[]): string {
  const b = bolag.filter(x => x && x.trim()).map(x => x.trim())
  if (b.length === 0) return ''
  if (b.length === 1) return b[0]
  return `${b.slice(0, -1).join(', ')} och ${b[b.length - 1]}`
}

/** Månaden/månaderna "skotat från …": en månad → dess namn, annars "tidigare månader". */
export function tidigareText(t: FacitSpar['tidigare_manader']): string {
  const med = t.filter(x => x.volym > 0)
  if (med.length === 1) return MANAD_NAMN[med[0].manad - 1] ?? 'tidigare månader'
  return 'tidigare månader'
}

/** Sista raden i ett spårkort: "Klart 29 sep · 265 skotat från augusti". Andra delen bara om volymen är > 0. */
export function klartText(s: FacitSpar, status: FacitStatus): string {
  const klart = s.klart_datum ? `Klart ${fmtDag(s.klart_datum)}` : status === 'avslutad' ? 'Inte klart' : 'Inte klart än'
  return s.skotat_fran_tidigare > 0 ? `${klart} · ${fmt(s.skotat_fran_tidigare)} skotat från ${tidigareText(s.tidigare_manader)}` : klart
}

const pct = (p: number) => `${Math.round(p)} %`
const maskinerText = (n: number) => `${n} ${n === 1 ? 'maskin' : 'maskiner'}`
const dagarText = (n: number) => `${n} ${n === 1 ? 'arbetsdag' : 'arbetsdagar'}`

// ── Vymodellen för sidan, PDF:en och bilden ─────────────────────────────────
export type FacitSparVy = {
  typ: Typ
  namn: string
  bestalltText: string
  bolagText: string
  skordatText: string
  skotatText: string
  skotatProcentText: string
  /** 0–1, kapad. */
  skordatAndel: number
  skotatAndel: number
  klartText: string
}
export type FacitVeckaVy = { etikett: string; skordat: number; skotat: number }
export type FacitModell = {
  ar: number
  manad: number
  manadNamn: string
  rubrik: string
  status: FacitStatus
  procentText: string
  levereratText: string
  bolagText: string
  spar: FacitSparVy[]
  veckor: FacitVeckaVy[]
  sidfot: string
  /** "manadsfacit-2026-09" (utan ändelse). */
  filnamn: string
}

const andel = (v: number, av: number) => (av > 0 ? Math.min(1, Math.max(0, v / av)) : 0)

/** null = ingen beställning den månaden alls (sidan säger det, ingen tom sida med 0 %). */
export function facitModell(f: Manadsfacit): FacitModell | null {
  if (!f.totalt) return null
  const t = f.totalt
  const spar: FacitSparVy[] = FACIT_ORDNING.flatMap(typ => {
    const s = f.spar[typ]
    if (!s) return []
    return [{
      typ,
      namn: TYP_NAMN[typ],
      bestalltText: fmt(s.bestallt),
      bolagText: bolagLista(s.bolag),
      skordatText: fmt(s.skordat),
      skotatText: fmt(s.skotat),
      skotatProcentText: pct(s.procent),
      skordatAndel: andel(s.skordat, s.bestallt),
      skotatAndel: andel(s.skotat, s.bestallt),
      klartText: klartText(s, f.status),
    }]
  })

  // Veckor: båda spåren lagda på samma vecka (samma veckor i båda — de tillhör månaden, inte spåret).
  const perVecka = new Map<string, FacitVeckaVy & { sort: number }>()
  for (const typ of FACIT_ORDNING) {
    for (const v of f.spar[typ]?.veckor ?? []) {
      const nyckel = `${v.iso_ar}-${v.isovecka}`
      const rad = perVecka.get(nyckel) ?? { etikett: `v${v.isovecka}`, skordat: 0, skotat: 0, sort: v.iso_ar * 100 + v.isovecka }
      rad.skordat += v.skordat
      rad.skotat += v.skotat
      perVecka.set(nyckel, rad)
    }
  }
  const veckor = Array.from(perVecka.values()).sort((a, b) => a.sort - b.sort).map(({ etikett, skordat, skotat }) => ({ etikett, skordat, skotat }))

  const manadNamn = MANAD_NAMN[f.manad - 1] ?? ''
  const alla = Array.from(new Set(FACIT_ORDNING.flatMap(typ => f.spar[typ]?.bolag ?? [])))
  return {
    ar: f.ar,
    manad: f.manad,
    manadNamn,
    rubrik: manadRubrik(f.ar, f.manad),
    status: f.status,
    procentText: pct(t.procent),
    levereratText: `Levererat ${fmt(t.skotat)} av ${fmt(t.bestallt)} m³fub`,
    bolagText: bolagLista(alla),
    spar,
    veckor,
    sidfot: `Skördat ${fmt(t.skordat)} · skotat ${fmt(t.skotat)} m³fub · ${maskinerText(t.maskiner)} · ${dagarText(t.arbetsdagar)}`,
    filnamn: `manadsfacit-${f.ar}-${String(f.manad).padStart(2, '0')}`,
  }
}

// ── Historiken ───────────────────────────────────────────────────────────────
export type HistorikStapel = { ar: number; manad: number; etikett: string; procent: number; over: boolean; href: string }
export type HistorikRad = { ar: number; manad: number; rubrik: string; procentText: string; dampad: boolean; href: string }
export type HistorikModell = {
  svar: string
  meta: string
  /** Äldst först (vänster → höger), högst 12. */
  staplar: HistorikStapel[]
  /** Nyast först. */
  rader: HistorikRad[]
}

export function facitHref(ar: number, manad: number): string {
  return `/helikopter/manad?ar=${ar}&manad=${manad}`
}

/** null = ingen månad med beställning att visa. */
export function historikModell(h: Historik): HistorikModell | null {
  if (h.manader.length === 0) return null
  const nyast = h.manader.slice(0, 12)
  const staplar = [...nyast].reverse().map(m => ({
    ar: m.ar, manad: m.manad, etikett: MANAD_KORT[m.manad - 1] ?? '', procent: m.procent, over: m.procent >= 100, href: facitHref(m.ar, m.manad),
  }))
  const rader = nyast.map(m => ({
    ar: m.ar, manad: m.manad, rubrik: manadRubrik(m.ar, m.manad), procentText: pct(m.procent), dampad: radDampad(m.procent), href: facitHref(m.ar, m.manad),
  }))
  const n = h.antal_6m
  return {
    svar: h.snitt_6m == null ? '–' : pct(h.snitt_6m),
    meta: `snitt senaste ${n === 1 ? 'månaden' : `${n} månader`} · ${h.inom_5_6m} av ${n} ${n === 1 ? 'månad' : 'månader'} inom ±5 %`,
    staplar,
    rader,
  }
}

/** Staplarnas höjd som andel (0–1) av diagrammets höjd. 100 %-linjen ligger vid `linje`. Skalan är minst 100 %, annars högsta stapeln. */
export function stapelSkala(procenter: number[]): { skala: number; linje: number } {
  const skala = Math.max(100, ...procenter)
  return { skala, linje: 100 / skala }
}

// ── Månadsnotisen ────────────────────────────────────────────────────────────
/** Payloaden i notis_kö (typ 'helikopter_manad') är helikopter_manadsfacit-svaret för föregående månad. */
export function formateraManadNotis(payload: unknown): string {
  const p = payload as any
  const namn = MANAD_NAMN[(Number(p?.manad) || 0) - 1] ?? ''
  const t = p?.totalt
  if (!namn) return 'Månadsfacit'
  if (!t || t.procent == null) return `Månadsfacit ${namn}: ingen beställning`
  return `Månadsfacit ${namn}: ${Math.round(Number(t.procent))} %`
}

export function manadNotisLank(payload: unknown): string {
  const p = payload as any
  return p?.ar && p?.manad ? facitHref(Number(p.ar), Number(p.manad)) : '/helikopter?flik=historik'
}
