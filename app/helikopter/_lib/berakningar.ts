// Ren beräkningslogik för /helikopter. Inga imports av React eller Supabase —
// allt här är testbart med vitest (berakningar.test.ts).
//
// Enhet: m³fub genomgående. Datan kommer ur SQL-funktionerna helikopter_ny_*
// (supabase/migrations/20260908100000_helikopter_ny.sql), som läser
// volym_m3sub = m³fub. Ingen omräkning sker här.

import type { Arbetsdagar, Avvikelse, BolagRad, Maskin, PlaneringObjekt, SparRad, Typ } from './queries'

// ── Trösklar och konstanter — EN plats ──────────────────────────────────────
/** Planeringsgolv: 8 h dagtid per arbetsdag. Övertid och extramaskin är buffert. */
export const TIMMAR_PER_DAG = 8
/** Takten räknas på de senaste N gångna arbetsdagarna (SQL: LIMIT 5). */
export const TAKT_FONSTER_DAGAR = 5
/** Ingen prognos före arbetsdag 4 i månaden → kräver 3 gångna arbetsdagar. */
export const PROGNOS_FRAN_ARBETSDAG = 4
/** |dagar efter| under detta = "På plan". */
export const PA_PLAN_GRANS_DAGAR = 1
/** Oskotat "i takt" när förändringen per dag ligger inom ± ett halvt lass. */
export const OSKOTAT_I_TAKT_M3_PER_DAG = 8
/** Skördaren mer än så här många dagar före skotaren → "dra ner eller byt trakt". */
export const SKORDARE_FORE_VARNING_DAGAR = 3
/** Bolagets historiska avvikelse används först vid så här många avslutade objekt. */
export const MIN_HISTORIK_OBJEKT = 5
/** Utan historik flaggas "saknas" när gapet är större än så här stor andel av beställt. */
export const SAKNAS_GRANS_UTAN_HISTORIK = 0.10
/** volym_m3sub är m³fub. Dokumenterad här och i migrationen; används inte i någon formel. */
export const M3FUB_FAKTOR = 1

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
 * skotat + takt × dagar kvar, men aldrig mer än vad som finns att skota:
 * ingående oskotat (öppna objekt vid månadsstart) + prognostiserat skördat.
 * Aldrig mindre än det som redan är skotat.
 */
export function prognosSkotat(skotat: number, taktSkotat: number | null, kvar: number, progSkordat: number, ingaendeOskotat = 0): number {
  const ra = skotat + (taktSkotat ?? 0) * kvar
  return Math.min(ra, Math.max(ingaendeOskotat + progSkordat, skotat))
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
  taktSkordat: number | null
  taktSkotat: number | null
  taktDagar: number
  harPrognos: boolean
  plan: number
  lage: Lage | null
  behovPerDag: number | null
  prognosSkordat: number | null
  prognosSkotat: number | null
  klartDatumSkotat: string | null
  klartDatumSkordat: string | null
  oskotatStatus: OskotatStatus | null
  oskotatForandring: number | null
  skordareDagarFore: number | null
}

export function raknaSpar(rad: SparRad, dagar: Arbetsdagar): SparLage {
  const prognos = harPrognos(rad.takt_dagar)
  const plan = planIdag(rad.bestallt, dagar.gangna, dagar.totalt)
  const pSkordat = prognos ? prognosSkordat(rad.skordat, rad.takt_skordat, dagar.kvar) : null
  const pSkotat = prognos && pSkordat != null ? prognosSkotat(rad.skotat, rad.takt_skotat, dagar.kvar, pSkordat, rad.ingaende_oskotat) : null
  const oskotat = rad.skordat - rad.skotat
  return {
    typ: rad.typ,
    bestallt: rad.bestallt,
    bolag: rad.bolag,
    skordat: rad.skordat,
    skotat: rad.skotat,
    oskotat,
    ingaendeOskotat: rad.ingaende_oskotat,
    taktSkordat: rad.takt_skordat,
    taktSkotat: rad.takt_skotat,
    taktDagar: rad.takt_dagar,
    harPrognos: prognos,
    plan,
    lage: prognos && rad.bestallt > 0 ? dagarEfter(plan, rad.skotat, rad.takt_skotat) : null,
    behovPerDag: rad.bestallt > 0 ? behovPerDag(rad.bestallt, rad.skotat, dagar.kvar) : null,
    prognosSkordat: pSkordat,
    prognosSkotat: pSkotat,
    klartDatumSkotat: prognos && rad.bestallt > 0 && pSkotat != null && pSkotat >= rad.bestallt
      ? klartDatum(rad.bestallt, rad.skotat, rad.takt_skotat, dagar.kvar_datum) : null,
    klartDatumSkordat: prognos && rad.bestallt > 0 && pSkordat != null && pSkordat >= rad.bestallt
      ? klartDatum(rad.bestallt, rad.skordat, rad.takt_skordat, dagar.kvar_datum) : null,
    oskotatStatus: prognos ? oskotatStatus(rad.oskotat_forandring_per_dag) : null,
    oskotatForandring: rad.oskotat_forandring_per_dag,
    skordareDagarFore: prognos ? skordareDagarFore(oskotat, rad.takt_skotat) : null,
  }
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

export function maskinNamn(m: Maskin): string {
  return m.modell || m.maskin_id
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
