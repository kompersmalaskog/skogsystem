// Vymodellen för /helikopter — så att ett barn förstår (Martin 2026-10-23). Sidan ritar bara det som står här.
//
// Sidan svarar på EN fråga per kort, i vanliga ord:
//   · svaret överst ("Vi hinner inte med beställningen")
//   · SKOTAT: ett block per spår — talet = SKOTAT HITTILLS, "av beställt", raden "Landar på N" (prognosen), en stapel där ljust = skotat
//     och mörkt = det som kommer till, och ordet bredvid pricken säger exakt vad: "Fattas 229" / "Hinner" / "Klar". Färgen är aldrig ensam.
//   · GÖR DETTA: högst tre rader på sidan — handlingar, viktigast först (flyttförslaget, maskiner som blir klara efter månaden,
//     maskiner som inte körde). Resten ligger bakom "N saker till".
//   · NÄR BLIR MASKINERNA KLARA?: namn + datum, inget mer. Trakterna visas när man trycker. Datumet räknas i appen (klar.ts raknaAlla)
//     på RPC:ns underlag, så att en trakt utan prognos kan få G15-förslaget ("ca 5 nov").
// Inga ·-kedjor, inga traktlistor, inga förklaringsrader med åtta fakta.
import type { Maskin, MaskinStopp, PlaneringObjekt, Typ, UtanTypRad, Arbetsdagar, EgenSkotningRad } from './queries'
import { KLAR_TYP_NAMN, arVirke, bastaFlytt, bestamdNamn, senasteKlar, type FlyttForslag, type KlarData, type KlarTrakt, type MaskinPlan } from './klar'
import { skillnadText } from '@/lib/prognosFoljer'
import {
  PROGNOS_FRAN_ARBETSDAG, TYPER, TYP_NAMN, landarRoller, maskinNamn, otilldelade, planeringStoppText,
  type ManadStatus, type PlaneratResultat, type SparLage,
} from './berakningar'
import { fmt, fmtDag, fmtVeckodagar, kortNamn, saknarData, sedanText } from './format'

// ── Ett block per spår ───────────────────────────────────────────────────────
export type Ton = 'orange' | 'gron' | 'dampad'
export type SparOrd = 'fattas' | 'hinner' | 'over' | 'klar' | 'hittills' | 'inte_startad' | 'inga_trakter' | 'ingen_bestallning'

export type SparKortVy = {
  typ: Typ
  namn: string
  /** Vad som gäller — ordet i `ord` är människans ord ("Fattas 229"). */
  lage: SparOrd
  ord: string
  ton: Ton
  /** Skärmens stora tal: SKOTAT HITTILLS, alltid (Martin 2026-10-24: ett stort tal under "Skotat" måste vara skotat — prognosen som tal lästes som ett faktum). */
  tal: number
  /** Var skotat landar vid månadens slut (prognos), raden under talet. null = ingen prognos. */
  landar: number | null
  /** Beställt. null = ingen beställning (då står inget "av"). */
  av: number | null
  /** 0–1: skotat hittills mot beställt (ljust). null = ingen stapel. */
  andel: number | null
  /** 0–1: där skotat landar (mörkt, från `andel` och framåt). null = ingen prognos. */
  prognosAndel: number | null
  /** 0–1: där ni borde vara idag (strecket). null = inget streck. */
  planAndel: number | null
}

const klamp = (x: number) => Math.max(0, Math.min(1, x))

export function sparKort(s: SparLage, status: ManadStatus, antalPlanerade: number): SparKortVy {
  const namn = TYP_NAMN[s.typ]
  const bas = { typ: s.typ, namn, av: s.bestallt, planAndel: null as number | null, prognosAndel: null as number | null, landar: null as number | null }
  if (s.bestallt <= 0) {
    return { ...bas, lage: 'ingen_bestallning', ord: 'Ingen beställning', ton: 'dampad', tal: Math.round(s.skotat), av: null, andel: null }
  }
  const andel = klamp(s.skotat / s.bestallt)
  if (status === 'kommande') return { ...bas, lage: 'inte_startad', ord: 'Inte startad', ton: 'dampad', tal: 0, andel: 0 }
  if (status === 'avslutad') {
    const skotat = Math.round(s.skotat)
    const klar = skotat >= s.bestallt
    return { ...bas, lage: klar ? 'klar' : 'fattas', ord: klar ? 'Klar' : `Fattas ${fmt(s.bestallt - skotat)}`, ton: klar ? 'gron' : 'orange', tal: skotat, andel }
  }
  if (antalPlanerade === 0) return { ...bas, lage: 'inga_trakter', ord: 'Inga trakter', ton: 'dampad', tal: Math.round(s.skotat), andel }
  const planAndel = s.plan > 0 ? klamp(s.plan / s.bestallt) : null
  const roller = landarRoller(s)
  if (!roller) return { ...bas, lage: 'hittills', ord: 'Hittills', ton: 'dampad', tal: Math.round(s.skotat), andel, planAndel }
  const skotat = roller[1]
  const landar = Math.round(skotat.landar)
  const tal = Math.round(s.skotat)
  const prognosAndel = klamp(skotat.landar / s.bestallt)
  if (skotat.framme) return { ...bas, lage: 'klar', ord: 'Klar', ton: 'gron', tal, landar, andel, prognosAndel, planAndel }
  if (skotat.under) return { ...bas, lage: 'fattas', ord: `Fattas ${fmt(s.bestallt - landar)}`, ton: 'orange', tal, landar, andel, prognosAndel, planAndel }
  if (skotat.over) return { ...bas, lage: 'over', ord: `Över med ${fmt(landar - s.bestallt)}`, ton: 'dampad', tal, landar, andel, prognosAndel, planAndel }
  return { ...bas, lage: 'hinner', ord: 'Hinner', ton: 'gron', tal, landar, andel, prognosAndel, planAndel }
}

// ── Svaret överst ────────────────────────────────────────────────────────────
export type SidSvar = { rubrik: string; avvikelse: boolean }

/** EN mening i vanliga ord: fattas > inga trakter > för tidigt > över > hinner/klar. */
export function sidSvar(kort: SparKortVy[], status: ManadStatus): SidSvar {
  if (status === 'kommande') return { rubrik: 'Månaden har inte börjat', avvikelse: false }
  const medBest = kort.filter(k => k.av != null)
  if (medBest.length === 0) return { rubrik: 'Ingen beställning inlagd', avvikelse: false }
  if (medBest.some(k => k.lage === 'fattas')) return { rubrik: status === 'avslutad' ? 'Vi hann inte med beställningen' : 'Vi hinner inte med beställningen', avvikelse: true }
  const utan = medBest.filter(k => k.lage === 'inga_trakter')
  if (utan.length > 0) return { rubrik: `${utan.map(k => k.namn).join(' och ')} har inga trakter`, avvikelse: false }
  if (medBest.some(k => k.lage === 'hittills')) return { rubrik: `För tidigt för prognos – kommer dag ${PROGNOS_FRAN_ARBETSDAG}`, avvikelse: false }
  if (status === 'avslutad') return { rubrik: 'Beställningen blev klar', avvikelse: false }
  if (medBest.every(k => k.lage === 'klar')) return { rubrik: 'Beställningen är klar', avvikelse: false }
  if (medBest.some(k => k.lage === 'over')) return { rubrik: 'Vi hinner mer än beställt', avvikelse: false }
  return { rubrik: 'Vi hinner med beställningen', avvikelse: false }
}

// ── Gör detta ────────────────────────────────────────────────────────────────
export type GorOppnar = 'flytt' | `maskin:${string}` | 'maskiner' | 'utan' | 'ej' | 'best' | 'ladda_om'
export type GorRad = {
  id: string
  text: string
  under: string | null
  oppnar: GorOppnar
  /** Orange prick: något att göra nu. Utan: dämpad, information. */
  orange: boolean
}

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

export type GorIndata = {
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
  /** Underlaget (med uppskattade prognoser) och planerna räknade ur det. null = inte läst / kunde inte läsas. */
  klar: KlarData | null
  planer: Record<string, MaskinPlan> | null
}

/** "Flytta Wisenten till Vashult" / under: "Då blir alla klara 29 okt" eller "Då blir sista klar 3 nov". */
export function flyttRad(f: FlyttForslag): GorRad {
  return {
    id: 'flytt', oppnar: 'flytt', orange: true,
    text: `Flytta ${bestamdNamn(f.till.namn)} till ${kortNamn(f.trakt)}`,
    under: f.iTid ? `Då blir alla klara ${fmtDag(f.nyttKlar)}` : `Då blir sista klar ${fmtDag(f.nyttKlar)} – fortfarande efter månaden`,
  }
}

/**
 * Det som ska göras, viktigast först: flyttförslaget · maskin klar efter månaden · maskin som inte körde · 810E utan lass ·
 * GROT/energi utan prognos · trakt utan maskin · beställt utan trakter · objekt utan typ. Sidan visar de tre första, resten bakom "N saker till".
 */
export function gorDetta(d: GorIndata): GorRad[] {
  const rader: GorRad[] = []
  const pagaende = d.status === 'pagaende'
  const aktiv = d.status !== 'avslutad'

  if (aktiv && d.klar && d.planer) {
    const flytt = bastaFlytt(d.klar)
    if (flytt) rader.push(flyttRad(flytt))
    const sena = Object.values(d.planer).filter(p => p.efterManad).sort((a, b) => ((a.klar as string) < (b.klar as string) ? 1 : -1))
    for (const p of sena) {
      // Flyttförslaget gäller den senaste maskinen — den raden säger redan att hon blir sen.
      if (flytt && (flytt.fran.maskin_id === p.maskin.maskin_id)) continue
      rader.push({
        id: `klar:${p.maskin.maskin_id}`, oppnar: `maskin:${p.maskin.maskin_id}`, orange: true,
        text: `${p.maskin.namn} blir klar ${p.uppskattad ? 'ca ' : ''}${fmtDag(p.klar as string)}`,
        under: `Efter månaden · ${p.rader.length} ${p.rader.length === 1 ? 'trakt' : 'trakter'} kvar`,
      })
    }
  }

  if (pagaende && d.maskinStopp) {
    for (const m of d.maskinStopp) {
      if (d.manuella.has(m.maskin_id) || m.oforklarade_datum.length === 0) continue
      rader.push({ id: `stod:${m.maskin_id}`, oppnar: 'maskiner', orange: true, text: `${m.namn} körde inte ${fmtVeckodagar(m.oforklarade_datum)}`, under: 'Ingen ledighet registrerad' })
    }
  }

  if (pagaende && d.senasteLass) {
    for (const { maskin, sedan } of manuellaUtanLass(d.maskiner.filter(m => d.manuella.has(m.maskin_id)), d.senasteLass, d.arbetsdagar, d.idag, d.manadNamn, d.rapportdagar)) {
      rader.push({ id: `lass:${maskin.maskin_id}`, oppnar: 'maskiner', orange: true, text: `${maskinNamn(maskin)} har inga lass ${sedan}`, under: 'Lassen registreras för hand' })
    }
  }

  if (aktiv && d.klar) {
    // Prognos saknas och förslaget räckte inte (GROT, energiklippning, eller inget utfall): en rad per trakt.
    const sett = new Set<string>()
    for (const t of d.klar.trakter) {
      if (!t.saknar_prognos || t.maskin_id == null || sett.has(t.objekt_id)) continue
      sett.add(t.objekt_id)
      rader.push({ id: `prognos:${t.objekt_id}`, oppnar: 'ej', orange: false, text: `${arVirke(t.typ) ? '' : `${KLAR_TYP_NAMN[t.typ]} `}${kortNamn(t.namn)} saknar prognos`, under: 'Skrivs i planeringsverktyget' })
    }
    const utanMaskin = new Map<string, string>()
    for (const t of d.klar.trakter) if (t.maskin_id == null) utanMaskin.set(t.objekt_id, t.namn)
    if (utanMaskin.size === 1) rader.push({ id: 'ej', oppnar: 'ej', orange: false, text: `${kortNamn([...utanMaskin.values()][0])} har ingen maskin`, under: 'Ligger inte i någon maskins kö' })
    else if (utanMaskin.size > 1) rader.push({ id: 'ej', oppnar: 'ej', orange: false, text: `${utanMaskin.size} trakter har ingen maskin`, under: 'Ligger inte i någon maskins kö' })
  } else if (aktiv) {
    const ej = new Set(TYPER.flatMap(t => otilldelade(d.planering, t).map(o => o.objekt_id)))
    if (ej.size > 0) rader.push({ id: 'ej', oppnar: 'ej', orange: false, text: ej.size === 1 ? `${kortNamn(d.planering.find(x => ej.has(x.objekt_id))?.namn)} har ingen maskin` : `${ej.size} trakter har ingen maskin`, under: null })
  }

  if (aktiv) {
    for (const t of TYPER) {
      if (d.plan[t].saknas > 0) rader.push({ id: `saknas:${t}`, oppnar: 'best', orange: false, text: `${TYP_NAMN[t]} saknar ${fmt(Math.round(d.plan[t].saknas))} m³fub trakter`, under: 'Beställt mer än trakterna rymmer' })
    }
  }

  if (d.utanTyp == null) {
    rader.push({ id: 'utan', oppnar: 'ladda_om', orange: false, text: 'Objekt utan typ eller bolag kunde inte läsas', under: 'Ladda om' })
  } else if (d.utanTyp.length > 0) {
    const summa = d.utanTyp.reduce((s, r) => s + r.volym, 0)
    rader.push({ id: 'utan', oppnar: 'utan', orange: false, text: `${fmt(Math.round(summa))} m³fub saknar typ eller bolag`, under: 'Räknas inte mot beställningen' })
  }
  return rader
}

/** Högst så många rader på sidan; resten bakom "N saker till". */
export const GOR_SYNLIGA = 3

// ── När blir maskinerna klara? ───────────────────────────────────────────────
export type KlarRad = {
  maskin_id: string
  namn: string
  roll: 'skordare' | 'skotare'
  /** "29 okt" · "ca 29 okt" (G15-förslag) · "–" (inget planerat) · "?" (en trakt saknar prognos). */
  hoger: string
  /** Blir klar efter månadens sista arbetsdag. */
  orange: boolean
  /** Inget planerat eller saknar prognos: dämpat tal. */
  dampad: boolean
  /** Stoppet, bara när maskinen står: "Står 26–30 okt · Daniel ledig · kör igen 2 nov". */
  under: string | null
  /** Trakterna i ordning, för arket: "Intaget gallring", "GROT Sibbesson" … */
  trakter: { objekt_id: string; namn: string; fran: string | null; till: string | null; uppskattad: boolean; under: string | null }[]
}

/** Raden under trakten i arket: följer takten (uppmätt) går före "räknat på liknande trakter" (gissat). */
export function traktUnder(t: Pick<KlarTrakt, 'uppskattad' | 'foljer'>): string | null {
  if (t.foljer) {
    const s = skillnadText(t.foljer.skillnad)
    return s ? `Följer takten på trakten · ${s}` : 'Följer takten på trakten'
  }
  return t.uppskattad ? 'Prognos räknad på liknande trakter' : null
}

export function klarRader(klar: KlarData, planer: Record<string, MaskinPlan>, stopp: MaskinStopp[] | null): KlarRad[] {
  return klar.maskiner.map(m => {
    const p = planer[m.maskin_id]
    const under = planeringStoppText(stopp?.find(s => s.maskin_id === m.maskin_id))
    const hoger = !p || p.rader.length === 0 ? '–' : p.saknar || p.klar == null ? '?' : `${p.uppskattad ? 'ca ' : ''}${fmtDag(p.klar)}`
    return {
      maskin_id: m.maskin_id, namn: m.namn, roll: m.roll, hoger, under,
      orange: !!p && p.efterManad && !p.saknar,
      dampad: !p || p.saknar || p.klar == null,
      trakter: (p?.rader ?? []).map(r => ({
        objekt_id: r.trakt.objekt_id, namn: `${arVirke(r.trakt.typ) ? '' : `${KLAR_TYP_NAMN[r.trakt.typ]} `}${kortNamn(r.trakt.namn)}`,
        fran: r.fran, till: r.till, uppskattad: r.trakt.uppskattad === true, under: traktUnder(r.trakt),
      })),
    }
  })
}

/** Noten under Klar-kortet: sista arbetsdagen, och vad ? och ca betyder — bara när de finns. */
export function klarNot(sistaArbetsdag: string, rader: KlarRad[]): string {
  const delar = [`Sista arbetsdagen är ${fmtDag(sistaArbetsdag)}`]
  if (rader.some(r => r.hoger === '?')) delar.push('? = en trakt saknar prognos')
  if (rader.some(r => r.hoger.startsWith('ca '))) delar.push('ca = räknat på liknande trakter')
  return delar.join(' · ')
}

/** Rubriken i flyttarket: "Flytta Wisenten till Vashult?" och vad som händer. */
export function flyttText2(f: FlyttForslag, planer: Record<string, MaskinPlan>): { rubrik: string; rader: string[] } {
  const nu = senasteKlar(planer)
  return {
    rubrik: `Flytta ${bestamdNamn(f.till.namn)} till ${kortNamn(f.trakt)}?`,
    rader: [
      `${f.roll === 'skordare' ? 'Skördningen' : 'Skotningen'} på ${kortNamn(f.trakt)} ligger på ${f.fran.namn} och blir klar ${nu ? fmtDag(nu) : '?'}.`,
      `Med ${bestamdNamn(f.till.namn)} blir ${f.iTid ? 'alla maskiner klara' : 'sista maskinen klar'} ${fmtDag(f.nyttKlar)}.`,
      'Trakten byter maskin i planeringen – inget annat ändras.',
    ],
  }
}

// ---------- EGEN SKOTNING (Martin 2026-10-25: "bara en egen rubrik, inget annat") ----------
// Markägaren skotar själv: inga lass kommer, så skördat i månaden är talet. Räknas ALDRIG mot beställningen, takten
// eller prognosen — rubriken finns för att den som läser Skotat ska veta att virket inte saknas, vi kör det bara inte.
export type EgenSkotningVy = {
  objekt_id: string
  /** "Trestensdal gallring" — kortNamn, aldrig ett id. */
  namn: string
  /** "Gallring · Vida" (typ och bolag som finns; saknas båda: "typ saknas"). */
  under: string
  /** "178 m³fub" — skördat i månaden. */
  tal: string
}

export function egenSkotningVy(rader: EgenSkotningRad[]): EgenSkotningVy[] {
  return rader
    .filter(r => r.skordat > 0)
    .map(r => {
      const typ = r.typ && (r.typ in TYP_NAMN) ? TYP_NAMN[r.typ as Typ] : r.typ ? r.typ.charAt(0).toUpperCase() + r.typ.slice(1) : null
      const delar = [typ, r.bolag].filter((x): x is string => !!x)
      // Prod: "Trestensdal gallring 2025." — punkten sist hindrar kortNamn från att släppa årsstumpen.
      return { objekt_id: r.objekt_id, namn: kortNamn(r.namn?.replace(/[.\s]+$/, '')), under: delar.length > 0 ? delar.join(' · ') : 'typ saknas', tal: `${fmt(r.skordat)} m³fub` }
    })
}

/** Noten under rubriken: EN mening, samma oavsett antal. */
export const EGEN_SKOTNING_NOT = 'Markägaren skotar själv · räknas inte mot beställningen'
