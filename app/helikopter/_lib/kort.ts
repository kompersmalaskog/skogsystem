// Vymodellen för /helikopter — så att ett barn förstår (Martin 2026-10-23). Sidan ritar bara det som står här.
//
// Sidan svarar på EN fråga per kort, med EN siffra per spår och EN mening överst:
//   · svaret överst ("Landar under beställt")
//   · SKOTAT MOT BESTÄLLNING: ett kort per spår — ordet (Under / Landar / Över / Nått) som prick + ord, talet (var skotat landar)
//     och en grå stapel (hur långt skotat kommit, strecket = där ni borde vara idag). Färgen är aldrig ensam: ordet står bredvid.
//   · BEHÖVER DIG: en rad per sak som kräver en människa — bara när det finns något.
//   · KLAR: ett datum per maskin (helikopter_ny_klar), orange prick när det blir efter månadens slut.
// Inga ·-kedjor, inga förklaringsrader med åtta fakta. Det som fanns förut (takt, behov, oskotat, stopp per spår) ligger bakom Mer.
import type { Maskin, MaskinStopp, PlaneringObjekt, Typ, UtanTypRad, Arbetsdagar } from './queries'
import type { KlarData } from './klar'
import {
  PROGNOS_FRAN_ARBETSDAG, TYPER, TYP_NAMN, landarRoller, maskinNamn, otilldelade, planeringStoppText,
  type ManadStatus, type PlaneratResultat, type SparLage,
} from './berakningar'
import { fmt, fmtDag, fmtVeckodagar, kortNamn, saknarData, sedanText } from './format'

// ── Ett kort per spår ────────────────────────────────────────────────────────
export type Ton = 'orange' | 'gron' | 'dampad'

export type SparKortVy = {
  typ: Typ
  namn: string
  /** Ordet bredvid pricken: Under · Landar · Över · Nått · Hittills · Inte startad · Inga trakter · Ingen beställning. */
  ord: string
  ton: Ton
  /** Skärmens tal för spåret: var skotat landar (prognos), annars skotat hittills. */
  tal: number
  /** Beställt. null = ingen beställning (då står inget "av"). */
  av: number | null
  /** 0–1: skotat hittills mot beställt. null = ingen stapel. */
  andel: number | null
  /** 0–1: där ni borde vara idag. null = inget streck. */
  planAndel: number | null
  /** En rad under stapeln (TYP.meta), eller ingen. */
  under: string | null
}

export function sparKort(s: SparLage, status: ManadStatus, antalPlanerade: number): SparKortVy {
  const namn = TYP_NAMN[s.typ]
  if (s.bestallt <= 0) {
    return { typ: s.typ, namn, ord: 'Ingen beställning', ton: 'dampad', tal: Math.round(s.skotat), av: null, andel: null, planAndel: null, under: null }
  }
  const andel = s.skotat / s.bestallt
  if (status === 'kommande') {
    return { typ: s.typ, namn, ord: 'Inte startad', ton: 'dampad', tal: 0, av: s.bestallt, andel: 0, planAndel: null, under: null }
  }
  if (status === 'avslutad') {
    const natt = Math.round(s.skotat) >= s.bestallt
    return { typ: s.typ, namn, ord: natt ? 'Nått' : 'Under', ton: natt ? 'gron' : 'orange', tal: Math.round(s.skotat), av: s.bestallt, andel, planAndel: null, under: `Skördat ${fmt(s.skordat)}` }
  }
  if (antalPlanerade === 0) {
    return { typ: s.typ, namn, ord: 'Inga trakter', ton: 'dampad', tal: Math.round(s.skotat), av: s.bestallt, andel, planAndel: null, under: null }
  }
  const planAndel = s.plan > 0 ? s.plan / s.bestallt : null
  const roller = landarRoller(s)
  if (!roller) {
    return { typ: s.typ, namn, ord: 'Hittills', ton: 'dampad', tal: Math.round(s.skotat), av: s.bestallt, andel, planAndel, under: `Prognos från dag ${PROGNOS_FRAN_ARBETSDAG}` }
  }
  const [skordat, skotat] = roller
  const ord = skotat.framme ? 'Nått' : skotat.under ? 'Under' : skotat.over ? 'Över' : 'Landar'
  const ton: Ton = skotat.framme ? 'gron' : skotat.under ? 'orange' : skotat.over ? 'dampad' : 'gron'
  return { typ: s.typ, namn, ord, ton, tal: Math.round(skotat.landar), av: s.bestallt, andel, planAndel, under: `Skördat landar ${fmt(Math.round(skordat.landar))}` }
}

// ── Svaret överst ────────────────────────────────────────────────────────────
export type SidSvar = { rubrik: string; avvikelse: boolean }

/** EN mening: Under > Inga trakter > Hittills (ingen prognos än) > Över > Landar/Nått. */
export function sidSvar(kort: SparKortVy[], status: ManadStatus): SidSvar {
  if (status === 'kommande') return { rubrik: 'Inte startad', avvikelse: false }
  const medBest = kort.filter(k => k.av != null)
  if (medBest.length === 0) return { rubrik: 'Ingen beställning inlagd', avvikelse: false }
  if (medBest.some(k => k.ord === 'Under')) return { rubrik: status === 'avslutad' ? 'Under beställt' : 'Landar under beställt', avvikelse: true }
  const utanTrakter = medBest.filter(k => k.ord === 'Inga trakter')
  if (utanTrakter.length > 0) return { rubrik: `${utanTrakter.map(k => k.namn).join(' och ')}: inga trakter planerade`, avvikelse: false }
  if (medBest.some(k => k.ord === 'Hittills')) return { rubrik: `Prognos från dag ${PROGNOS_FRAN_ARBETSDAG}`, avvikelse: false }
  if (medBest.some(k => k.ord === 'Över')) return { rubrik: 'Landar över beställt', avvikelse: false }
  if (status === 'avslutad') return { rubrik: 'Beställningen nådd', avvikelse: false }
  return { rubrik: 'Landar på beställningen', avvikelse: false }
}

// ── Behöver dig ──────────────────────────────────────────────────────────────
export type BehovOppnar = 'maskiner' | 'utan' | 'ej' | 'best' | 'ladda_om'
export type BehovRad = { id: string; text: string; under: string | null; oppnar: BehovOppnar }

/** Manuell datakälla (810E) utan registrerade lass någon av de två senaste rapportdagarna — en post per maskin. */
export function manuellaUtanLass(
  manuella: Maskin[], senasteLass: Record<string, string | null>, arbetsdagar: Arbetsdagar[], idag: string, manadNamn: string,
  rapportdagar?: Record<string, string[]> | null,
): { maskin: Maskin; sedan: string }[] {
  const ut: { maskin: Maskin; sedan: string }[] = []
  const globala = arbetsdagar.find(a => a.maskin_id == null) ?? null
  for (const m of manuella) {
    if (m.aktiv_till && m.aktiv_till < idag) continue
    const egna = arbetsdagar.find(a => a.maskin_id === m.maskin_id) ?? globala
    const dagar = rapportdagar?.[m.maskin_id]?.filter(d => d <= idag) ?? (egna ? [...egna.gangna_datum, ...egna.kvar_datum].filter(d => d <= idag) : [])
    const senast = senasteLass[m.maskin_id] ?? null
    if (!saknarData({ senast_datum: senast, dagar_tom_idag: dagar }, dagar)) continue
    ut.push({ maskin: m, sedan: sedanText(senast, idag, manadNamn) })
  }
  return ut
}

export type BehovIndata = {
  status: ManadStatus
  maskinStopp: MaskinStopp[] | null
  manuella: Set<string>
  maskiner: Maskin[]
  senasteLass: Record<string, string | null> | null
  arbetsdagar: Arbetsdagar[]
  rapportdagar: Record<string, string[]> | null
  idag: string
  manadNamn: string
  utanTyp: UtanTypRad[] | null
  planering: PlaneringObjekt[]
  plan: Record<Typ, PlaneratResultat>
  klar: KlarData | null
}

/** Det som kräver en människa, en rad var. Ordning: maskiner som inte räcker · maskiner som inte körde · lass som inte registrerats · trakter · data. Tom lista = inget kort. */
export function behoverDig(d: BehovIndata): BehovRad[] {
  const rader: BehovRad[] = []
  const pagaende = d.status === 'pagaende'

  if (d.klar && d.status !== 'avslutad') {
    for (const m of d.klar.maskiner) {
      if (m.efter_manad && m.klar_datum) rader.push({ id: `klar:${m.maskin_id}`, text: `${m.namn} blir klar ${fmtDag(m.klar_datum)}`, under: 'Efter månadens slut', oppnar: 'maskiner' })
      else if (m.saknar_prognos && m.trakter.length > 0) rader.push({ id: `prognos:${m.maskin_id}`, text: `${m.namn}: en trakt saknar prognos`, under: 'Läggs i planeringsverktyget', oppnar: 'ej' })
    }
  }

  if (pagaende && d.maskinStopp) {
    for (const m of d.maskinStopp) {
      if (d.manuella.has(m.maskin_id) || m.oforklarade_datum.length === 0) continue
      rader.push({ id: `stod:${m.maskin_id}`, text: `${m.namn} körde inte ${fmtVeckodagar(m.oforklarade_datum)}`, under: 'Ingen ledighet registrerad', oppnar: 'maskiner' })
    }
  }

  if (pagaende && d.senasteLass) {
    for (const { maskin, sedan } of manuellaUtanLass(d.maskiner.filter(m => d.manuella.has(m.maskin_id)), d.senasteLass, d.arbetsdagar, d.idag, d.manadNamn, d.rapportdagar)) {
      rader.push({ id: `lass:${maskin.maskin_id}`, text: `${maskinNamn(maskin)} har inga lass ${sedan}`, under: 'Lassen registreras för hand', oppnar: 'maskiner' })
    }
  }

  if (d.status !== 'avslutad') {
    const ej = new Set(TYPER.flatMap(t => otilldelade(d.planering, t).map(o => o.objekt_id)))
    if (ej.size === 1) {
      const o = d.planering.find(x => ej.has(x.objekt_id))
      rader.push({ id: 'ej', text: `${kortNamn(o?.namn)} har ingen maskin`, under: null, oppnar: 'ej' })
    } else if (ej.size > 1) {
      rader.push({ id: 'ej', text: `${ej.size} trakter har ingen maskin`, under: null, oppnar: 'ej' })
    }
    for (const t of TYPER) {
      if (d.plan[t].saknas > 0) rader.push({ id: `saknas:${t}`, text: `${TYP_NAMN[t]} saknar ${fmt(Math.round(d.plan[t].saknas))} m³fub trakter`, under: null, oppnar: 'best' })
    }
  }

  if (d.utanTyp == null) {
    rader.push({ id: 'utan', text: 'Objekt utan typ eller bolag kunde inte läsas', under: 'Ladda om', oppnar: 'ladda_om' })
  } else {
    const summa = d.utanTyp.reduce((s, r) => s + r.volym, 0)
    if (d.utanTyp.length > 0) rader.push({ id: 'utan', text: `${fmt(Math.round(summa))} m³fub saknar typ eller bolag`, under: 'Räknas inte mot beställningen', oppnar: 'utan' })
  }
  return rader
}

// ── Klar: ett datum per maskin ───────────────────────────────────────────────
export type KlarRad = {
  maskin_id: string
  namn: string
  roll: 'skordare' | 'skotare'
  /** Trakterna i ordning (korta namn, högst tre, sedan "+N"), eller stoppet. */
  under: string | null
  /** "29 okt" · "–" (inget planerat) · "?" (trakt utan prognos). */
  hoger: string
  /** Blir klar efter månadens sista arbetsdag. */
  orange: boolean
  /** Inget planerat eller saknar prognos: dämpat tal. */
  dampad: boolean
}

export function klarRader(klar: KlarData, stopp: MaskinStopp[] | null): KlarRad[] {
  const namnFor = new Map(klar.trakter.map(t => [`${t.objekt_id}:${t.roll}`, kortNamn(t.namn)]))
  return klar.maskiner.map(m => {
    const trakter = m.trakter.map(t => namnFor.get(`${t.objekt_id}:${m.roll}`) ?? 'Objekt')
    const stoppText = planeringStoppText(stopp?.find(s => s.maskin_id === m.maskin_id))
    const traktText = trakter.length === 0 ? null : trakter.length <= 3 ? trakter.join(' · ') : `${trakter.slice(0, 3).join(' · ')} +${trakter.length - 3}`
    const under = [stoppText, traktText].filter(Boolean).join(' · ') || null
    const hoger = m.saknar_prognos ? '?' : m.klar_datum ? fmtDag(m.klar_datum) : '–'
    return { maskin_id: m.maskin_id, namn: m.namn, roll: m.roll, under, hoger, orange: m.efter_manad && !m.saknar_prognos, dampad: m.saknar_prognos || !m.klar_datum }
  })
}
