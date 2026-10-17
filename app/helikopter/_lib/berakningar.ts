// Ren beräkningslogik för /helikopter. Inga imports av React eller Supabase —
// allt här är testbart med vitest (berakningar.test.ts).
//
// Enhet: m³fub genomgående. Datan kommer ur SQL-funktionerna helikopter_ny_*
// (supabase/migrations/20260908100000_helikopter_ny.sql), som läser
// volym_m3sub = m³fub. Ingen omräkning sker här.

import type { Arbetsdagar, Avvikelse, BolagRad, Maskin, MaskinStopp, MaskinTakt, PlaneringObjekt, SparRad, StoppRad, Typ } from './queries'
import { MANAD_NAMN, STOPP_ORSAK, dagarText, fmt, fmtDag, fmtPeriod, fmtVeckodagar, kortNamn, saknarData, sedanText } from './format'

// ── Trösklar: EN fil — trosklar.ts. Återexporteras här för anroparna. ──────
import {
  MIN_HISTORIK_OBJEKT, OSKOTAT_I_TAKT_M3_PER_DAG, OVER_BESTALLT_GRANS, PA_PLAN_GRANS_DAGAR, PROGNOS_FRAN_ARBETSDAG,
  SAKNAS_GRANS_UTAN_HISTORIK, TIMMAR_PER_DAG,
} from './trosklar'
export * from './trosklar'

export const TYPER: Typ[] = ['gallring', 'slutavverkning']
export const TYP_NAMN: Record<Typ, string> = { gallring: 'Gallring', slutavverkning: 'Slutavverkning' }

// ── Bas: beställda bolag eller alla ─────────────────────────────────────────
/** Finns beställning för typen räknas bara beställda bolags produktion, annars allt. */
export function valjBas(rader: SparRad[], typ: Typ): SparRad | null {
  const best = rader.find(r => r.typ === typ && r.bas === 'bestallt')
  const tot = rader.find(r => r.typ === typ && r.bas === 'totalt')
  if (best && best.bestallt > 0) return best
  return tot ?? best ?? null
}

export function globalaArbetsdagar(rader: Arbetsdagar[]): Arbetsdagar | null {
  return rader.find(r => r.maskin_id == null) ?? null
}

// ── Läge ────────────────────────────────────────────────────────────────────
export function harPrognos(taktDagar: number): boolean {
  return taktDagar >= PROGNOS_FRAN_ARBETSDAG - 1
}

/** Plan idag = beställt × (arbetsdagar gångna / arbetsdagar totalt). */
export function planIdag(bestallt: number, gangna: number, totalt: number): number {
  if (totalt <= 0) return 0
  return bestallt * (gangna / totalt)
}

/** (beställt − skotat) / arbetsdagar kvar. null när inga dagar kvar. */
export function behovPerDag(bestallt: number, skotat: number, kvar: number): number | null {
  if (kvar <= 0) return null
  return Math.max(0, bestallt - skotat) / kvar
}

export type Lage = { status: 'efter' | 'pa_plan' | 'fore'; dagar: number }

/** (plan idag − skotat) / takt. |x| < 1 → på plan, annars hela dagar. null utan takt. */
export function dagarEfter(plan: number, skotat: number, taktSkotat: number | null): Lage | null {
  if (taktSkotat == null || taktSkotat <= 0) return null
  const raw = (plan - skotat) / taktSkotat
  if (Math.abs(raw) < PA_PLAN_GRANS_DAGAR) return { status: 'pa_plan', dagar: 0 }
  return { status: raw > 0 ? 'efter' : 'fore', dagar: Math.round(Math.abs(raw)) }
}

export function prognosSkordat(skordat: number, taktSkordat: number | null, kvar: number): number {
  return skordat + (taktSkordat ?? 0) * kvar
}

/**
 * skotat + det som skotarna tillkommer med (takt × dagar kvar, per maskin summerat), men aldrig mer än vad som finns att skota:
 * ingående oskotat (öppna objekt vid månadsstart) + prognostiserat skördat.
 * Aldrig mindre än det som redan är skotat.
 */
export function prognosSkotatTillkommer(skotat: number, tillkommer: number, progSkordat: number, ingaendeOskotat = 0): number {
  return Math.min(skotat + tillkommer, Math.max(ingaendeOskotat + progSkordat, skotat))
}

/** Samma med en gemensam takt och gemensamma dagar kvar (spårets takt × global kvar) — reserven när maskinernas takt inte gick att läsa. */
export function prognosSkotat(skotat: number, taktSkotat: number | null, kvar: number, progSkordat: number, ingaendeOskotat = 0): number {
  return prognosSkotatTillkommer(skotat, (taktSkotat ?? 0) * kvar, progSkordat, ingaendeOskotat)
}

// ── Prognos per maskin: takt × maskinens EGNA arbetsdagar kvar ─────────────
/** Maskinerna i spåret (typ + bas) ur helikopter_ny_takt. */
export function sparTakter(rad: Pick<SparRad, 'typ' | 'bas'>, takter: MaskinTakt[] | null | undefined): MaskinTakt[] {
  return (takter ?? []).filter(t => t.typ === rad.typ && t.bas === rad.bas)
}

/** Σ takt × kvar för maskinerna i rollen: vad rollen tillkommer med till månadens slut. En maskin utan takt (inga gångna dagar) bidrar 0. */
export function tillkommerRoll(mt: MaskinTakt[], roll: MaskinTakt['roll']): number {
  return mt.filter(t => t.roll === roll).reduce((sum, t) => sum + (t.takt ?? 0) * t.kvar, 0)
}

/** Första arbetsdag då hittills + Σ (takt av de maskiner som kör den dagen) når beställt — maskinens ledighetsdagar räknas inte. */
export function klartDatumMaskiner(bestallt: number, gjort: number, mt: MaskinTakt[]): string | null {
  const perDag = new Map<string, number>()
  for (const m of mt) for (const d of m.kvar_datum) perDag.set(d, (perDag.get(d) ?? 0) + (m.takt ?? 0))
  const datum = Array.from(perDag.keys()).sort()
  if (datum.length === 0) return null
  const kvarM3 = bestallt - gjort
  if (kvarM3 <= 0) return datum[0]
  let kum = 0
  for (const d of datum) {
    kum += perDag.get(d) as number
    if (kum >= kvarM3) return d
  }
  return null
}

/** Datumet (ISO) för den arbetsdag då kvarvarande volym är klar i nuvarande takt. */
export function klartDatum(bestallt: number, gjort: number, takt: number | null, kvarDatum: string[]): string | null {
  if (takt == null || takt <= 0 || kvarDatum.length === 0) return null
  const kvarM3 = bestallt - gjort
  if (kvarM3 <= 0) return kvarDatum[0]
  const n = Math.ceil(kvarM3 / takt)
  return kvarDatum[n - 1] ?? null
}

export type OskotatStatus = 'vaxer' | 'minskar' | 'i_takt'

export function oskotatStatus(forandringPerDag: number | null): OskotatStatus | null {
  if (forandringPerDag == null) return null
  if (forandringPerDag > OSKOTAT_I_TAKT_M3_PER_DAG) return 'vaxer'
  if (forandringPerDag < -OSKOTAT_I_TAKT_M3_PER_DAG) return 'minskar'
  return 'i_takt'
}

/** Hur många dagar skotaren ligger efter skördaren = oskotat / skotarens takt. */
export function skordareDagarFore(oskotat: number, taktSkotat: number | null): number | null {
  if (taktSkotat == null || taktSkotat <= 0) return null
  return Math.round(Math.max(0, oskotat) / taktSkotat)
}

/** Allt om ett spår som Läge/Uppföljning behöver, räknat en gång. */
export type SparLage = {
  typ: Typ
  bestallt: number
  bolag: string[]
  skordat: number
  skotat: number
  oskotat: number
  ingaendeOskotat: number
  oskotatObjekt: { namn: string | null; oskotat: number }[]
  taktSkordat: number | null
  taktSkotat: number | null
  taktDagar: number
  harPrognos: boolean
  plan: number
  lage: Lage | null
  behovPerDag: number | null
  /** (beställt − skördat) / arbetsdagar kvar. null när inga dagar kvar. */
  behovPerDagSkordat: number | null
  prognosSkordat: number | null
  prognosSkotat: number | null
  klartDatumSkotat: string | null
  klartDatumSkordat: string | null
  oskotatStatus: OskotatStatus | null
  oskotatForandring: number | null
  skordareDagarFore: number | null
  /** Maskinerna som kört i spåret i månaden (helikopter_ny_takt, volym > 0) — styr vilka stopp som nämns på spårets förklaringsrad. */
  maskinIds: string[]
}

/**
 * `takter` = maskinernas takt och dagar kvar (helikopter_ny_takt): prognosen är då hittills + Σ takt × maskinens egna arbetsdagar kvar, så en
 * maskin med ledig förare räknas inte som dålig takt och inte som arbetsdag. Utan `takter` (kunde inte läsas) räknas som förut: spårets takt × globala dagar kvar.
 */
export function raknaSpar(rad: SparRad, dagar: Arbetsdagar, takter?: MaskinTakt[] | null): SparLage {
  const mt = sparTakter(rad, takter)
  const perMaskin = mt.length > 0
  const skotarna = mt.filter(t => t.roll === 'skotare')
  const skordarna = mt.filter(t => t.roll === 'skordare')
  const prognos = harPrognos(rad.takt_dagar)
  const plan = planIdag(rad.bestallt, dagar.gangna, dagar.totalt)
  const pSkordat = prognos ? (perMaskin ? rad.skordat + tillkommerRoll(mt, 'skordare') : prognosSkordat(rad.skordat, rad.takt_skordat, dagar.kvar)) : null
  const pSkotat = prognos && pSkordat != null
    ? (perMaskin ? prognosSkotatTillkommer(rad.skotat, tillkommerRoll(mt, 'skotare'), pSkordat, rad.ingaende_oskotat) : prognosSkotat(rad.skotat, rad.takt_skotat, dagar.kvar, pSkordat, rad.ingaende_oskotat))
    : null
  const oskotat = rad.skordat - rad.skotat
  return {
    typ: rad.typ,
    bestallt: rad.bestallt,
    bolag: rad.bolag,
    skordat: rad.skordat,
    skotat: rad.skotat,
    oskotat,
    ingaendeOskotat: rad.ingaende_oskotat,
    oskotatObjekt: rad.oskotat_objekt ?? [],
    taktSkordat: rad.takt_skordat,
    taktSkotat: rad.takt_skotat,
    taktDagar: rad.takt_dagar,
    harPrognos: prognos,
    plan,
    lage: prognos && rad.bestallt > 0 ? dagarEfter(plan, rad.skotat, rad.takt_skotat) : null,
    behovPerDag: rad.bestallt > 0 ? behovPerDag(rad.bestallt, rad.skotat, dagar.kvar) : null,
    behovPerDagSkordat: rad.bestallt > 0 ? behovPerDag(rad.bestallt, rad.skordat, dagar.kvar) : null,
    prognosSkordat: pSkordat,
    prognosSkotat: pSkotat,
    klartDatumSkotat: prognos && rad.bestallt > 0 && pSkotat != null && pSkotat >= rad.bestallt
      ? (perMaskin ? klartDatumMaskiner(rad.bestallt, rad.skotat, skotarna) : klartDatum(rad.bestallt, rad.skotat, rad.takt_skotat, dagar.kvar_datum)) : null,
    klartDatumSkordat: prognos && rad.bestallt > 0 && pSkordat != null && pSkordat >= rad.bestallt
      ? (perMaskin ? klartDatumMaskiner(rad.bestallt, rad.skordat, skordarna) : klartDatum(rad.bestallt, rad.skordat, rad.takt_skordat, dagar.kvar_datum)) : null,
    oskotatStatus: prognos ? oskotatStatus(rad.oskotat_forandring_per_dag) : null,
    oskotatForandring: rad.oskotat_forandring_per_dag,
    skordareDagarFore: prognos ? skordareDagarFore(oskotat, rad.takt_skotat) : null,
    maskinIds: mt.filter(t => t.volym_manad > 0).map(t => t.maskin_id),
  }
}

// ── Landar vi på beställningen? Prognos per roll ───────────────────────────
// Svarsraden (Läge), Uppföljningens spårkort, Veckoläget och onsdagsnotisen svarar alla på EN fråga: landar vi på beställningen — både
// skördat och skotat? Prognosen per roll är hittills + Σ över maskinerna i rollen av takt (senaste 5 dagar maskinen körde) × maskinens egna arbetsdagar kvar. Skördat kapas aldrig; skotat kapas
// vid skördat-prognos + ingående oskotat (se prognosSkotat). "Under" jämförs på de AVRUNDADE talen, så en rad aldrig säger "landar under"
// bredvid "1 000 av 1 000". Dagar efter plan (dagarEfter) styr inte längre svarsraden.
export type RollNyckel = 'skordat' | 'skotat'

export type RollLandar = {
  roll: RollNyckel
  /** "Skördat" / "Skotat". */
  namn: string
  ikon: 'forest' | 'local_shipping'
  hittills: number
  takt: number | null
  /** Prognos vid månadens slut. */
  landar: number
  bestallt: number
  /** (beställt − hittills) / arbetsdagar kvar; null när inga dagar kvar. */
  behov: number | null
  /** Landar under beställt (avrundade tal). */
  under: boolean
  /** Redan framme: hittills ≥ beställt. */
  framme: boolean
  /** Landar mer än OVER_BESTALLT_GRANS över beställt (avrundade tal). Neutralt, inte grönt: svarsraden blir dämpad. */
  over: boolean
  /** Avrundad landar − beställt (negativt = under). */
  overMangd: number
  /** Första arbetsdag då hittills + takt × n ≥ beställt (ISO). null = når inte, eller redan framme. */
  naDatum: string | null
}

/** Skördat och skotat för ett spår. null utan beställning eller prognos (före arbetsdag 4). */
export function landarRoller(s: SparLage): [RollLandar, RollLandar] | null {
  if (s.bestallt <= 0 || !s.harPrognos || s.prognosSkordat == null || s.prognosSkotat == null) return null
  const rulle = (roll: RollNyckel): RollLandar => {
    const skordat = roll === 'skordat'
    const hittills = skordat ? s.skordat : s.skotat
    const landar = (skordat ? s.prognosSkordat : s.prognosSkotat) as number
    const framme = Math.round(hittills) >= s.bestallt
    return {
      roll,
      namn: skordat ? 'Skördat' : 'Skotat',
      ikon: skordat ? 'forest' : 'local_shipping',
      hittills,
      takt: skordat ? s.taktSkordat : s.taktSkotat,
      landar,
      bestallt: s.bestallt,
      behov: skordat ? s.behovPerDagSkordat : s.behovPerDag,
      under: Math.round(landar) < s.bestallt,
      framme,
      over: Math.round(landar) > s.bestallt * (1 + OVER_BESTALLT_GRANS),
      overMangd: Math.round(landar) - s.bestallt,
      naDatum: framme ? null : skordat ? s.klartDatumSkordat : s.klartDatumSkotat,
    }
  }
  return [rulle('skordat'), rulle('skotat')]
}

/** Hur långt under beställt rollen landar, som andel av beställt (0 = precis på). Större = sämre. */
function underAndel(r: RollLandar): number {
  return Math.max(0, (r.bestallt - r.landar) / r.bestallt)
}

/** "behöver 29/dag, kör 0" — eller att inga arbetsdagar finns kvar. */
function behovText(r: RollLandar, avskiljare: string): string {
  return r.behov == null ? 'inga arbetsdagar kvar' : `behöver ${fmt(r.behov)}/dag${avskiljare}kör ${fmt(r.takt ?? 0)}`
}

/** Under raden i Uppföljningens spårkort, höger: "når beställt 26 okt" / "behöver 34/dag · kör 56". */
export function rollHogerText(r: RollLandar): string {
  if (r.framme) return 'beställt nått'
  if (!r.under) return r.naDatum ? `når beställt ${fmtDag(r.naDatum)}` : 'når beställt'
  return behovText(r, ' · ')
}

// ── Planering: volym ─────────────────────────────────────────────────────────
export type PlaneratResultat = {
  /** Summa objekt.volym för månadens objekt av typen (bara de med volym och bolag). */
  planerat: number
  /** Planerat korrigerat med bolagets historiska avvikelse (där historik finns). */
  korrigerat: number
  antalObjekt: number
  /** t.ex. −6 (procent) när minst ett objekt korrigerats, annars null. */
  justeringProcent: number | null
  utanVolym: number
  utanBolag: number
  /** beställt − korrigerat (positivt = fattas). */
  gap: number
  /** Gräns för att flagga "saknas": bolagets spridning eller 10 % utan historik. */
  grans: number
  /** > 0 när gapet överstiger gränsen. */
  saknas: number
}

function harBolag(o: PlaneringObjekt): boolean {
  return !!(o.bolag && o.bolag.trim())
}
function harVolym(o: PlaneringObjekt): boolean {
  return o.volym != null && o.volym > 0
}

export function planeratPerTyp(objekt: PlaneringObjekt[], typ: Typ, bestallt: number, avvikelse: Avvikelse[]): PlaneratResultat {
  const avTyp = objekt.filter(o => o.typ === typ)
  const utanVolym = avTyp.filter(o => !harVolym(o)).length
  const utanBolag = avTyp.filter(o => harVolym(o) && !harBolag(o)).length
  const medraknade = avTyp.filter(o => harVolym(o) && harBolag(o))
  let planerat = 0, korrigerat = 0, spridning = 0, korrigerade = 0
  for (const o of medraknade) {
    const v = o.volym as number
    planerat += v
    const hist = avvikelse.find(a => a.typ === typ && a.bolag.toLowerCase() === (o.bolag as string).trim().toLowerCase())
    if (hist && hist.antal >= MIN_HISTORIK_OBJEKT) {
      korrigerat += v * hist.medel_kvot
      spridning += v * (hist.std_kvot ?? 0)
      korrigerade++
    } else {
      korrigerat += v
    }
  }
  const justeringProcent = korrigerade > 0 && planerat > 0 ? Math.round((korrigerat / planerat - 1) * 100) : null
  const gap = bestallt - korrigerat
  const grans = korrigerade > 0 ? spridning : bestallt * SAKNAS_GRANS_UTAN_HISTORIK
  const saknas = bestallt > 0 && gap > grans ? gap : 0
  return { planerat, korrigerat, antalObjekt: medraknade.length, justeringProcent, utanVolym, utanBolag, gap, grans, saknas }
}

// ── Planering: timmar mot kapacitet ─────────────────────────────────────────
export type Roll = 'skordare' | 'skotare'

export type BelagtObjekt = { objektId: string; namn: string; typ: string; roll: Roll; timmar: number | null; klar: boolean }

export type MaskinBelaggning = {
  maskin: Maskin
  roll: Roll
  kapacitetH: number
  belagtH: number
  luftH: number
  objekt: BelagtObjekt[]
  saknarPrognos: number
}

export function maskinRoll(m: Maskin): Roll | null {
  return m.maskin_typ === 'Harvester' ? 'skordare' : m.maskin_typ === 'Forwarder' ? 'skotare' : null
}

/** Kapacitetsmaskin = skördare/skotare, inte extramaskin, inte såld före dagens datum. */
export function kapacitetsMaskiner(maskiner: Maskin[], idag: string): Maskin[] {
  return maskiner.filter(m => maskinRoll(m) != null && !m.extramaskin && (!m.aktiv_till || m.aktiv_till >= idag))
}

/** klarar_typ 'bada' eller lika med typen. Saknas värde behandlas som 'bada'. */
export function klararTyp(m: Maskin, typ: string): boolean {
  const k = (m.klarar_typ || 'bada').toLowerCase()
  return k === 'bada' || k === typ.toLowerCase()
}

/**
 * Timmar per maskin ur manuell_prognos mot kapacitet = maskinens arbetsdagar × 8 h.
 * `dagarPerMaskin` är rader ur helikopter_ny_arbetsdagar; för innevarande månad
 * används dagar KVAR och redan klara objekt räknas bort, för kommande månad hela
 * månaden. Objekt med utförare egen/extern ligger inte på våra maskiner.
 */
export function belaggning(
  objekt: PlaneringObjekt[],
  maskiner: Maskin[],
  dagarPerMaskin: Arbetsdagar[],
  idag: string,
  pagaendeManad: boolean,
): MaskinBelaggning[] {
  return kapacitetsMaskiner(maskiner, idag).map(m => {
    const roll = maskinRoll(m) as Roll
    const dagar = dagarPerMaskin.find(d => d.maskin_id === m.maskin_id) ?? globalaArbetsdagar(dagarPerMaskin)
    const antalDagar = dagar ? (pagaendeManad ? dagar.kvar : dagar.totalt) : 0
    const kapacitetH = antalDagar * TIMMAR_PER_DAG
    const rader: BelagtObjekt[] = []
    for (const o of objekt) {
      const utforare = roll === 'skordare' ? o.skordare_utforare : o.skotare_utforare
      if (utforare === 'egen' || utforare === 'extern') continue
      const maskinId = roll === 'skordare' ? o.skordare_maskin_id : o.skotare_maskin_id
      if (maskinId !== m.maskin_id) continue
      const klar = roll === 'skordare' ? o.klar_skordare : o.klar_skotare
      if (pagaendeManad && klar) continue
      rader.push({ objektId: o.objekt_id, namn: o.namn || o.vo_nummer || 'Objekt', typ: o.typ, roll, timmar: roll === 'skordare' ? o.prognos_skordare_h : o.prognos_skotare_h, klar })
    }
    const belagtH = rader.reduce((s, r) => s + (r.timmar ?? 0), 0)
    return { maskin: m, roll, kapacitetH, belagtH, luftH: kapacitetH - belagtH, objekt: rader, saknarPrognos: rader.filter(r => r.timmar == null).length }
  })
}

export type TimmarForTyp = {
  timmar: number
  /** Kapacitet som är kvar för typen på de maskiner som bär typens objekt (övriga typers timmar bortdragna). */
  kapacitet: number
  luft: number
  maskiner: MaskinBelaggning[]
  saknarPrognos: number
}

export function timmarForTyp(bel: MaskinBelaggning[], typ: Typ): TimmarForTyp {
  const bar = bel.filter(b => b.objekt.some(o => o.typ === typ))
  let timmar = 0, kapacitet = 0, saknarPrognos = 0
  for (const b of bar) {
    const egna = b.objekt.filter(o => o.typ === typ)
    const andra = b.objekt.filter(o => o.typ !== typ)
    timmar += egna.reduce((s, o) => s + (o.timmar ?? 0), 0)
    kapacitet += b.kapacitetH - andra.reduce((s, o) => s + (o.timmar ?? 0), 0)
    saknarPrognos += egna.filter(o => o.timmar == null).length
  }
  return { timmar, kapacitet, luft: kapacitet - timmar, maskiner: bar, saknarPrognos }
}

/** Objekt av typen utan maskin och utan utförare — de får inte försvinna tyst. */
export function otilldelade(objekt: PlaneringObjekt[], typ: Typ): PlaneringObjekt[] {
  return objekt.filter(o => o.typ === typ && o.status !== 'avslutat' && (
    (!o.skordare_maskin_id && !o.skordare_utforare) || (!o.skotare_maskin_id && !o.skotare_utforare)))
}

// ── Planering: åtgärd ────────────────────────────────────────────────────────
export type Atgard = { slag: 'planera' | 'flytta' | 'overtid' | 'prata' | 'tilldela' | 'prognos'; text: string; href?: string }

/**
 * Åtgärdsförslag i prioritetsordning. Kort maskin: minsta objekt på den korta
 * maskinen flyttas till en maskin med luft som klarar typen; annars övertid i
 * dagar; räcker inte det inom månaden: prata med bolaget. Aldrig tomt när
 * något är fel.
 */
export function atgardForTyp(
  typ: Typ,
  plan: PlaneratResultat,
  tim: TimmarForTyp,
  allaMaskiner: MaskinBelaggning[],
  kvarDagar: number,
  objektHref: string,
  fmt: (n: number) => string,
): Atgard | null {
  if (plan.saknas > 0) {
    return { slag: 'planera', text: `Saknas ${fmt(plan.saknas)} m³fub – planera in fler objekt`, href: objektHref }
  }
  if (tim.luft < 0) {
    const korta = tim.maskiner.filter(b => b.luftH < 0)
    for (const b of korta) {
      const kandidater = b.objekt.filter(o => o.typ === typ && o.timmar != null).sort((x, y) => (x.timmar as number) - (y.timmar as number))
      for (const o of kandidater) {
        const mal = allaMaskiner.find(k => k.roll === b.roll && k.maskin.maskin_id !== b.maskin.maskin_id && klararTyp(k.maskin, typ) && k.luftH >= (o.timmar as number))
        if (mal) {
          return { slag: 'flytta', text: `Flytta ${o.namn} (${fmt(o.timmar as number)} h) till ${maskinNamn(mal.maskin)} · ${fmt(mal.luftH)} h luft` }
        }
      }
    }
    const kortH = -tim.luft
    const dagar = Math.max(1, Math.ceil(kortH / TIMMAR_PER_DAG))
    if (dagar <= Math.max(kvarDagar, 0)) {
      return { slag: 'overtid', text: `${fmt(kortH)} h kort – ${dagar} ${dagar === 1 ? 'dag' : 'dagar'} övertid` }
    }
    return { slag: 'prata', text: `${fmt(kortH)} h kort – räcker inte i månaden. Prata med bolaget` }
  }
  if (tim.saknarPrognos > 0) {
    return { slag: 'prognos', text: `${tim.saknarPrognos} objekt saknar timprognos – fyll i`, href: objektHref }
  }
  return null
}

/** Ett maskinnamn i hela appen: visningsnamn (admin) före modell (fil) före id. */
export function maskinNamn(m: Maskin): string {
  return (m.visningsnamn && m.visningsnamn.trim()) || m.modell || m.maskin_id
}

// ── Uppföljning per bolag ───────────────────────────────────────────────────
/** Bolagets skotat + bolagets egen takt × dagar kvar. Utan takt: dagens skotat. */
export function prognosPerBolag(rad: BolagRad, kvar: number, harPrognos: boolean): number {
  if (!harPrognos || rad.takt_skotat == null) return rad.skotat
  return rad.skotat + rad.takt_skotat * kvar
}

// ── Månadens tillstånd ──────────────────────────────────────────────────────
export type ManadStatus = 'avslutad' | 'pagaende' | 'kommande'

export function manadStatus(ar: number, manad: number, idag: string): ManadStatus {
  const nyckel = `${ar}-${String(manad).padStart(2, '0')}`
  const idagNyckel = idag.slice(0, 7)
  return nyckel < idagNyckel ? 'avslutad' : nyckel > idagNyckel ? 'kommande' : 'pagaende'
}

// ── Svarsrader: det viktigaste överst, max en avvikelse ─────────────────────
export type Svar = { rubrik: string; rad: string | null; avvikelse: boolean; /** Orange tredje rad: registrering som saknas (manuell datakälla). */ varning?: string | null }

/** Läge: landar vi på beställningen — både skördat och skotat? Under (sämst först) > saknar objekt > väntar på prognos > landar. */
export function lageSvar(spar: SparLage[], antalPlanerade: Record<Typ, number>, status: ManadStatus, dagar: Arbetsdagar | null, manadNamn: string): Svar {
  const medBest = spar.filter(s => s.bestallt > 0)
  if (status === 'kommande') return { rubrik: 'Inte startad', rad: null, avvikelse: false }
  if (medBest.length === 0) {
    const skotat = spar.filter(s => s.skotat > 0).map(s => `${TYP_NAMN[s.typ].toLowerCase()} ${fmt(s.skotat)}`)
    return { rubrik: 'Ingen beställning inlagd', rad: skotat.length > 0 ? `Skotat ${skotat.join(' · ')}` : null, avvikelse: false }
  }
  if (status === 'avslutad') {
    const under = medBest.filter(s => s.skotat < s.bestallt).sort((a, b) => (a.skotat - a.bestallt) - (b.skotat - b.bestallt))
    if (under.length === 0) return { rubrik: medBest.length > 1 ? 'Klart · båda spåren' : `Klart · ${TYP_NAMN[medBest[0].typ].toLowerCase()}`, rad: null, avvikelse: false }
    const s = under[0]
    return { rubrik: `${TYP_NAMN[s.typ]} ${fmt(s.skotat - s.bestallt)} m³fub mot beställt`, rad: `Skotat ${fmt(s.skotat)} av ${fmt(s.bestallt)}`, avvikelse: true }
  }
  const aktiva = medBest.filter(s => antalPlanerade[s.typ] > 0)
  // Prognos mot beställt, per spår och roll. Sämst först (störst andel som saknas); en rad om spåret/rollen som ligger sämst.
  const under = aktiva
    .map(s => ({ s, roller: landarRoller(s) }))
    .filter((x): x is { s: SparLage; roller: [RollLandar, RollLandar] } => x.roller != null && x.roller.some(r => r.under))
    .sort((a, b) => Math.max(...b.roller.map(underAndel)) - Math.max(...a.roller.map(underAndel)))
  if (under.length > 0) {
    const namn = TYPER.filter(t => under.some(u => u.s.typ === t)).map((t, i) => (i === 0 ? TYP_NAMN[t] : TYP_NAMN[t].toLowerCase()))
    const { s: varsta, roller } = under[0]
    const roller_under = roller.filter(r => r.under)
    const rad = roller_under.length === 2
      ? `Skördat ${fmt(roller[0].landar)} · skotat ${fmt(roller[1].landar)} av ${fmt(varsta.bestallt)}`
      : `${roller_under[0].namn} ${fmt(roller_under[0].landar)} av ${fmt(varsta.bestallt)} · ${behovText(roller_under[0], ', ')}`
    return { rubrik: `${namn.join(' och ')} landar under beställt`, rad, avvikelse: true }
  }
  const utanObjekt = medBest.filter(s => antalPlanerade[s.typ] === 0)
  if (utanObjekt.length > 0) {
    const s = utanObjekt[0]
    const andra = aktiva.find(a => a.typ !== s.typ)
    const andraSkotat = andra ? landarRoller(andra)?.[1] : null
    const rad = andra ? (andra.harPrognos ? (andraSkotat?.over ? `${TYP_NAMN[andra.typ]} landar ${fmt(andraSkotat.overMangd)} över beställt` : `${TYP_NAMN[andra.typ]} landar på beställningen`) : `${TYP_NAMN[andra.typ]}: prognos från dag ${PROGNOS_FRAN_ARBETSDAG}`) : null
    return { rubrik: `${TYP_NAMN[s.typ]}: inga objekt planerade`, rad, avvikelse: false }
  }
  if (aktiva.some(s => !s.harPrognos)) {
    return { rubrik: `Prognos från dag ${PROGNOS_FRAN_ARBETSDAG}`, rad: dagar ? `arbetsdag ${dagar.gangna + 1} av ${dagar.totalt}` : null, avvikelse: false }
  }
  // Över beställt (> 5 %): rubriken säger hur mycket, raden när beställt räcker och att resten går på nästa månad. Dämpad — inget är fel, men inte grönt.
  const over = aktiva
    .map(s => ({ s, skotat: landarRoller(s)?.[1] ?? null }))
    .filter((x): x is { s: SparLage; skotat: RollLandar } => x.skotat != null && x.skotat.over)
    .sort((a, b) => b.skotat.overMangd - a.skotat.overMangd)
  if (over.length > 0) {
    const { s, skotat } = over[0]
    const nasta = MANAD_NAMN[(Math.max(0, MANAD_NAMN.indexOf(manadNamn)) + 1) % 12]
    const racker = skotat.framme ? 'Beställt är nått' : skotat.naDatum ? `Räcker ca ${fmtDag(skotat.naDatum)}` : 'Räcker i månaden'
    const delar = [`${racker} · resten går på ${nasta}`]
    for (const o of over.slice(1)) delar.push(`${TYP_NAMN[o.s.typ]} landar ${fmt(o.skotat.overMangd)} över`)
    return { rubrik: `${TYP_NAMN[s.typ]} landar ${fmt(skotat.overMangd)} över beställt`, rad: delar.join(' · '), avvikelse: false }
  }
  const spartext = [...aktiva].sort((a, b) => TYPER.indexOf(b.typ) - TYPER.indexOf(a.typ)).map((s, i) => (i === 0 ? TYP_NAMN[s.typ] : TYP_NAMN[s.typ].toLowerCase())).join(' och ')
  return { rubrik: 'Landar på beställningen', rad: `${spartext} · skördat och skotat`, avvikelse: false }
}

/**
 * Läge-varning för maskiner med manuell datakälla (datakalla 'manuell', JD810E) som saknar
 * registrerade lass någon av de två senaste arbetsdagarna (maskinens egna, t.o.m. i dag —
 * samma regel som "inga lass sedan" i notisen): "John Deere 810E · inga lass registrerade
 * sedan tisdag". Flera maskiner skiljs med " · ". null = inget att varna för.
 *
 * Dagarna är maskinens RAPPORTDAGAR (helikopter_ny_rapportdagar: arbetsdagar t.o.m. idag utom planerade stopp, orapporterade med).
 * Arbetsdagarna duger inte här: en manuell maskin utan lass är 'orapporterat' och ingår inte i dem, så larmet skulle tystna
 * av sig självt. Saknas rapportdagarna (äldre payload / RPC:n ej körd) räknas de ur maskinens egna arbetsdagar som förut.
 */
export function registreringsVarning(manuella: Maskin[], senasteLass: Record<string, string | null>, arbetsdagar: Arbetsdagar[], idag: string, manadNamn: string, rapportdagar?: Record<string, string[]> | null): string | null {
  const rader: string[] = []
  for (const m of manuella) {
    if (m.aktiv_till && m.aktiv_till < idag) continue
    const egna = arbetsdagar.find(a => a.maskin_id === m.maskin_id) ?? globalaArbetsdagar(arbetsdagar)
    const dagar = rapportdagar?.[m.maskin_id]?.filter(d => d <= idag) ?? (egna ? [...egna.gangna_datum, ...egna.kvar_datum].filter(d => d <= idag) : [])
    const senast = senasteLass[m.maskin_id] ?? null
    if (!saknarData({ senast_datum: senast, dagar_tom_idag: dagar }, dagar)) continue
    rader.push(`${maskinNamn(m)} · inga lass registrerade ${sedanText(senast, idag, manadNamn)}`)
  }
  return rader.length > 0 ? rader.join(' · ') : null
}

// ── Planerade stopp, härledda ur ledighet + filer (helikopter_ny_stopp) ──────
/** 'ledig:Stefan' → "Stefan ledig"; 'registrerat:produktionsbegransning' → "Produktionsbegränsning". */
export function orsakText(orsak: string | null): string {
  if (!orsak) return ''
  if (orsak.startsWith('ledig:')) return `${orsak.slice(6)} ledig`
  if (orsak.startsWith('registrerat:')) {
    const kod = orsak.slice(12)
    return STOPP_ORSAK[kod] ?? (kod || 'Registrerat stopp')
  }
  return orsak
}

/** Stoppet nämns på Läge och i takten: pågående och kommande alltid; ett som varit bara om det ligger i maskinens takt-fönster (då förklarar det varför takten är vad den är). */
export function stoppSynligt(s: MaskinStopp): boolean {
  if (!s.stopp_fran || !s.stopp_till) return false
  if (s.stopp_status === 'pagar' || s.stopp_status === 'kommande') return true
  return s.stopp_status === 'varit' && s.takt_fran != null && s.stopp_till >= s.takt_fran
}

/** "står 14–16 okt · Stefan ledig" ("stod" när det varit) — utan maskinnamn, för rader som redan har maskinen som rubrik. */
export function stoppUtanNamn(s: MaskinStopp): string {
  return `${s.stopp_status === 'varit' ? 'stod' : 'står'} ${fmtPeriod(s.stopp_fran as string, s.stopp_till as string)} · ${orsakText(s.stopp_orsak)}`
}

/** "Giant står 14–16 okt · Stefan ledig" ("stod" när det varit). */
export function stoppDel(s: MaskinStopp): string {
  return `${s.namn} ${stoppUtanNamn(s)}`
}

/** Förklaringen först på spårets rad i MOT BESTÄLLNING: maskinerna som kört i spåret och har ett synligt stopp. null = inget att säga. */
export function sparStoppText(s: Pick<SparLage, 'maskinIds'>, stopp: MaskinStopp[] | null | undefined): string | null {
  const delar = (stopp ?? []).filter(m => s.maskinIds.includes(m.maskin_id) && stoppSynligt(m)).map(stoppDel)
  return delar.length > 0 ? delar.join(' · ') : null
}

/** Planering, maskinrad: "Står 14–16 okt · Stefan ledig · kör igen 19 okt". Bara pågående och kommande stopp — det som redan varit är inte planering. */
export function planeringStoppText(s: MaskinStopp | undefined): string | null {
  if (!s || !s.stopp_fran || !s.stopp_till || (s.stopp_status !== 'pagar' && s.stopp_status !== 'kommande')) return null
  const korIgen = s.stopp_kor_igen ? ` · kör igen ${fmtDag(s.stopp_kor_igen)}` : ''
  return `Står ${fmtPeriod(s.stopp_fran, s.stopp_till)} · ${orsakText(s.stopp_orsak)}${korIgen}`
}

/**
 * Läge-varning för OFÖRKLARAT: maskinen körde inte (ingen fil) och ingen av dess förare var ledig, någon av de 5 dagar takten räknas på:
 * "Giant körde inte ons–fre · ingen ledighet registrerad". Det enda stoppfallet som är en avvikelse — planerat stopp hamnar aldrig här.
 * Maskiner med manuell datakälla (810E) lämnas åt registreringsVarning: där betyder "ingen fil" att lass inte registrerats, inte att maskinen stod.
 */
export function oforklaratVarning(stopp: MaskinStopp[] | null | undefined, manuella: Set<string>, status: ManadStatus): string | null {
  if (status !== 'pagaende' || !stopp) return null
  const rader = stopp.filter(m => !manuella.has(m.maskin_id) && m.oforklarade_datum.length > 0)
  if (rader.length === 0) return null
  return `${rader.map(m => `${m.namn} körde inte ${fmtVeckodagar(m.oforklarade_datum)}`).join(', ')} · ingen ledighet registrerad`
}

/**
 * Stopp som orsak i klartext, för notiserna: "Giant stod 3 dagar (Stefan ledig)" (planerade/registrerade stoppdagar i månaden före idag) och
 * "Elefant 26 står 26–30 okt (Daniel ledig)" (pågående/kommande). Ingen rankning — maskinerna i den ordning de kommer. null = inga stopp.
 */
export function stoppNotisText(stopp: MaskinStopp[] | null | undefined, maskinIds?: string[]): string | null {
  const delar: string[] = []
  for (const m of (stopp ?? []).filter(x => !maskinIds || maskinIds.includes(x.maskin_id))) {
    if (m.stopp_dagar_manad > 0) {
      const orsaker = Array.from(new Set(m.stopp_orsaker_manad.map(orsakText))).join(', ')
      delar.push(`${m.namn} stod ${dagarText(m.stopp_dagar_manad)} (${orsaker})`)
    }
    if (m.stopp_fran && m.stopp_till && (m.stopp_status === 'pagar' || m.stopp_status === 'kommande')) {
      delar.push(`${m.namn} står ${fmtPeriod(m.stopp_fran, m.stopp_till)} (${orsakText(m.stopp_orsak)})`)
    }
  }
  return delar.length > 0 ? delar.join(' · ') : null
}

/** Underraden i MOT BESTÄLLNING: "Giant står 14–16 okt · Stefan ledig · Kör 94/dag · behöver 252 · oskotat växer 247/dag · landar 3 300" (stoppet först, när en av spårets maskiner har ett). */
export function motBestallningRad(s: SparLage, antalPlanerade: number, status: ManadStatus, manadNamn: string, stoppText?: string | null): { text: string; muted: boolean } {
  if (s.bestallt <= 0) return { text: 'Ingen beställning inlagd', muted: true }
  if (status !== 'avslutad' && antalPlanerade === 0) {
    return { text: `Inga objekt planerade${s.skotat > 0 ? ' · skotar ut föregående månad' : ''}`, muted: true }
  }
  if (status === 'avslutad') return { text: `Skotat ${fmt(s.skotat)} av ${fmt(s.bestallt)}`, muted: false }
  if (status === 'kommande') return { text: 'Inte startad', muted: true }
  const fore = stoppText ? `${stoppText} · ` : ''
  if (!s.harPrognos) return { text: `${fore}Prognos från dag ${PROGNOS_FRAN_ARBETSDAG}`, muted: !stoppText }
  const oskotat = s.oskotatStatus === 'vaxer' ? `oskotat växer ${fmt(s.oskotatForandring ?? 0)}/dag`
    : s.oskotatStatus === 'minskar' ? `oskotat minskar ${fmt(-(s.oskotatForandring ?? 0))}/dag` : 'oskotat i takt'
  const landar = s.prognosSkotat != null ? ` · landar ${fmt(s.prognosSkotat)}` : ''
  return { text: `${fore}Kör ${fmt(s.taktSkotat ?? 0)}/dag · behöver ${fmt(s.behovPerDag ?? 0)} · ${oskotat}${landar}`, muted: false }
}

/** Åtgärd för en kort maskin: minsta objekt → maskin med luft som klarar typen; annars övertid i dagar; annars bolaget. */
export function atgardForMaskin(b: MaskinBelaggning, alla: MaskinBelaggning[], kvarDagar: number): string {
  const kandidater = b.objekt.filter(o => !o.klar && o.timmar != null).sort((x, y) => (x.timmar as number) - (y.timmar as number))
  for (const o of kandidater) {
    const mal = alla.find(k => k.roll === b.roll && k.maskin.maskin_id !== b.maskin.maskin_id && klararTyp(k.maskin, o.typ) && k.luftH >= (o.timmar as number))
    if (mal) return `${kortNamn(o.namn)} kan flyttas till ${maskinNamn(mal.maskin)}`
  }
  const kortH = -b.luftH
  const dagar = Math.max(1, Math.ceil(kortH / TIMMAR_PER_DAG))
  if (dagar <= Math.max(kvarDagar, 0)) return `${dagarText(dagar)} övertid`
  return 'Prata med bolaget'
}

/** Planering: maskin över kapacitet > kubik saknas > allt får plats. */
export function planeringSvar(bel: MaskinBelaggning[], plan: Record<Typ, PlaneratResultat>, kvarDagar: number): Svar {
  const korta = bel.filter(b => b.luftH < 0).sort((a, b) => a.luftH - b.luftH)
  const saknas = TYPER.filter(t => plan[t].saknas > 0).sort((a, b) => plan[b].saknas - plan[a].saknas)
  const saknasText = (t: Typ) => `${TYP_NAMN[t].toLowerCase()} saknar ${fmt(plan[t].saknas)} m³fub`
  if (korta.length > 0) {
    const b = korta[0]
    const delar = [atgardForMaskin(b, bel, kvarDagar)]
    if (saknas.length > 0) delar.push(saknasText(saknas[0]))
    return { rubrik: `${maskinNamn(b.maskin)} ${fmt(-b.luftH)} h kort`, rad: delar.join(' · '), avvikelse: true }
  }
  if (saknas.length > 0) {
    const t = saknas[0]
    const delar = ['Planera in fler objekt']
    if (saknas[1]) delar.push(saknasText(saknas[1]))
    return { rubrik: `${TYP_NAMN[t]} saknar ${fmt(plan[t].saknas)} m³fub`, rad: delar.join(' · '), avvikelse: true }
  }
  const luft = bel.reduce((sum, b) => sum + Math.max(b.luftH, 0), 0)
  return { rubrik: `Allt planerat får plats · ${fmt(luft)} h luft`, rad: null, avvikelse: false }
}

/** Maskinens stopp som berör månaden (för Planeringens underrad). */
export function stoppForMaskin(stopp: StoppRad[], maskinId: string): StoppRad[] {
  return stopp.filter(s => s.maskiner.includes(maskinId)).sort((a, b) => a.fran_datum.localeCompare(b.fran_datum))
}
