// "Räcker månaden?" som DATUM — payloaden ur helikopter_ny_klar (migration 20261017150000) och räkningen ovanpå den.
//
// SQL:en räknar fram klar-datum för DAGENS tilldelning. Appen räknar om SAMMA sak i TS för det SQL:en inte kan svara på i förväg:
// "byt maskin" (vad blir klar-datumet OM trakten får en annan maskin?) och flytt-förslaget. Därför bär payloaden allt som behövs för
// räkningen — maskinens lediga dagar, kapacitet (h/dag) eller snittakt (810E), och varje trakts kvarvarande timmar/volym — och
// klar.test.ts kör TS-räkningen mot ett svar ur prod: de två ska ge samma datum.
//
// Regler (samma som i SQL):
//  · trakterna på en maskin i ordning (`sortn`, sätts i SQL ur objekt.ordning, ar/manad, namn);
//  · dagar för en trakt = kvarvarande timmar / maskinens G15 per arbetsdag — eller, för maskin med manuell datakälla, kvarvarande volym / snittakt;
//  · trakt n börjar på dag floor(kumulativt före)+1 och slutar på dag ceil(kumulativt efter), räknat på maskinens lediga dagar (avrundat till 6 decimaler);
//  · saknas prognos (eller volym/takt för den manuella) på någon trakt: maskinen har inget datum (null) — aldrig en gissning.
// Inga imports av React eller Supabase.
import { TYP_NAMN, klararTyp } from './berakningar'
import { MANAD_NAMN, fmt, fmtDag, kortNamn } from './format'
import type { Maskin, Typ } from './queries'

export type KlarRoll = 'skordare' | 'skotare'

export type KlarTrakt = {
  objekt_id: string
  namn: string
  typ: Typ
  roll: KlarRoll
  /** Tilldelad maskin för rollen; null = ingen maskin. */
  maskin_id: string | null
  /** Sorteringsplats (objekt.ordning, ar, manad, namn) som ett tal — appen sorterar bara på det. */
  sortn: number
  ordning: number | null
  ar: number | null
  manad: number | null
  /** Trakt från förra månaden som inte är klar för rollen. */
  forra_manaden: boolean
  volym: number | null
  /** Kvarvarande G15-timmar för rollen; null = prognos saknas. */
  timmar: number | null
  /** Kvarvarande volym att skota (bara skotare); används av maskin med manuell datakälla. */
  rest_volym: number | null
  saknar_prognos: boolean
}

export type KlarMaskinTrakt = { objekt_id: string; fran: string | null; till: string | null }

export type KlarMaskin = {
  maskin_id: string
  namn: string
  roll: KlarRoll
  klarar_typ: string
  manuell: boolean
  g15_per_dag: number
  ej_matt: boolean
  /** m³/dag per typ — bara den manuella maskinen räknas på den. */
  takt: Partial<Record<Typ, number>>
  /** Maskinens lediga arbetsdagar från start, sex månader framåt. */
  dagar: string[]
  klar_datum: string | null
  efter_manad: boolean
  saknar_prognos: boolean
  trakter: KlarMaskinTrakt[]
}

export type KlarSparTrakt = { objekt_id: string; namn: string; volym: number; saknar_prognos: boolean; forra_manaden: boolean }
export type KlarSpar = { typ: Typ; bestallt: number; trakt_volym: number; trakter: KlarSparTrakt[] }

export type KlarData = {
  ar: number
  manad: number
  idag: string
  start: string
  sista_arbetsdag: string
  har_bestallning: boolean
  maskiner: KlarMaskin[]
  trakter: KlarTrakt[]
  spar: KlarSpar[]
}

// ── Läs payloaden (ett konstigt svar är ett fel, aldrig "inga trakter") ─────
const tal = (v: unknown, vad: string): number => {
  const n = Number(v)
  if (v == null || v === '' || !Number.isFinite(n)) throw new Error(`Ogiltigt tal (${vad}) i helikopter_ny_klar`)
  return n
}
const talEllerNull = (v: unknown, vad: string): number | null => (v == null ? null : tal(v, vad))
const datum = (v: unknown, vad: string): string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) throw new Error(`Ogiltigt datum (${vad}) i helikopter_ny_klar`)
  return v.slice(0, 10)
}
const datumEllerNull = (v: unknown, vad: string): string | null => (v == null ? null : datum(v, vad))
const typ = (v: unknown): Typ => {
  if (v === 'gallring' || v === 'slutavverkning') return v
  throw new Error('Okänd typ i helikopter_ny_klar')
}
const roll = (v: unknown): KlarRoll => {
  if (v === 'skordare' || v === 'skotare') return v
  throw new Error('Okänd roll i helikopter_ny_klar')
}

export function lasKlar(raw: unknown): KlarData {
  const r = raw as any
  if (!r || typeof r !== 'object' || !Array.isArray(r.maskiner) || !Array.isArray(r.trakter) || !Array.isArray(r.spar)) throw new Error('Tomt svar från helikopter_ny_klar')
  return {
    ar: tal(r.ar, 'ar'),
    manad: tal(r.manad, 'manad'),
    idag: datum(r.idag, 'idag'),
    start: datum(r.start, 'start'),
    sista_arbetsdag: datum(r.sista_arbetsdag, 'sista_arbetsdag'),
    har_bestallning: r.har_bestallning === true,
    maskiner: r.maskiner.map((m: any): KlarMaskin => ({
      maskin_id: String(m.maskin_id),
      namn: String(m.namn ?? m.maskin_id),
      roll: roll(m.roll),
      klarar_typ: String(m.klarar_typ ?? 'bada'),
      manuell: m.manuell === true,
      g15_per_dag: tal(m.g15_per_dag, 'g15_per_dag'),
      ej_matt: m.ej_matt === true,
      takt: Object.fromEntries(Object.entries(m.takt ?? {}).filter(([k, v]) => (k === 'gallring' || k === 'slutavverkning') && Number(v) > 0).map(([k, v]) => [k, Number(v)])),
      dagar: Array.isArray(m.dagar) ? m.dagar.map((d: unknown) => datum(d, 'dag')) : [],
      klar_datum: datumEllerNull(m.klar_datum, 'klar_datum'),
      efter_manad: m.efter_manad === true,
      saknar_prognos: m.saknar_prognos === true,
      trakter: Array.isArray(m.trakter) ? m.trakter.map((t: any) => ({ objekt_id: String(t.objekt_id), fran: datumEllerNull(t.fran, 'fran'), till: datumEllerNull(t.till, 'till') })) : [],
    })),
    trakter: r.trakter.map((t: any): KlarTrakt => ({
      objekt_id: String(t.objekt_id),
      namn: String(t.namn ?? 'Objekt'),
      typ: typ(t.typ),
      roll: roll(t.roll),
      maskin_id: t.maskin_id == null ? null : String(t.maskin_id),
      sortn: tal(t.sortn, 'sortn'),
      ordning: talEllerNull(t.ordning, 'ordning'),
      ar: talEllerNull(t.ar, 'ar'),
      manad: talEllerNull(t.manad, 'manad'),
      forra_manaden: t.forra_manaden === true,
      volym: talEllerNull(t.volym, 'volym'),
      timmar: talEllerNull(t.timmar, 'timmar'),
      rest_volym: talEllerNull(t.rest_volym, 'rest_volym'),
      saknar_prognos: t.saknar_prognos === true,
    })),
    spar: r.spar.map((s: any): KlarSpar => ({
      typ: typ(s.typ),
      bestallt: tal(s.bestallt, 'bestallt'),
      trakt_volym: tal(s.trakt_volym, 'trakt_volym'),
      trakter: Array.isArray(s.trakter) ? s.trakter.map((t: any): KlarSparTrakt => ({
        objekt_id: String(t.objekt_id), namn: String(t.namn ?? 'Objekt'), volym: tal(t.volym ?? 0, 'volym'),
        saknar_prognos: t.saknar_prognos === true, forra_manaden: t.forra_manaden === true,
      })) : [],
    })),
  }
}

// ── Räkningen ───────────────────────────────────────────────────────────────
const avrunda6 = (x: number) => Math.round(x * 1e6) / 1e6

/** Maskinen klarar traktens typ (klarar_typ 'bada' eller lika med typen) — samma regel som resten av helikoptern. */
export function klararTraktTyp(m: Pick<KlarMaskin, 'klarar_typ'>, t: Typ): boolean {
  return klararTyp({ klarar_typ: m.klarar_typ } as Maskin, t)
}

/** Kan maskinen ta trakten? Rätt typ — och en maskin utan mätt G15 (810E, manuell) bara där den har en snittakt att räkna på. */
export function kanTa(m: KlarMaskin, t: Pick<KlarTrakt, 'typ'>): boolean {
  return klararTraktTyp(m, t.typ) && (!m.manuell || (m.takt[t.typ] ?? 0) > 0)
}

/** Dagar en trakt tar på maskinen; null = det går inte att räkna (prognos, volym eller takt saknas). */
export function dagarBehov(m: KlarMaskin, t: KlarTrakt): number | null {
  if (m.manuell) {
    const takt = m.takt[t.typ]
    return t.rest_volym == null || !(takt != null && takt > 0) ? null : t.rest_volym / takt
  }
  return t.timmar == null || !(m.g15_per_dag > 0) ? null : t.timmar / m.g15_per_dag
}

/** Klar trakt (inget kvar att göra för rollen) hör inte till maskinens kö — som i SQL. */
function arKvar(m: KlarMaskin, t: KlarTrakt): boolean {
  if (m.manuell) return t.rest_volym == null || t.rest_volym > 0
  return t.timmar == null || t.timmar > 0
}

export type PlanRad = { trakt: KlarTrakt; dagar: number | null; fran: string | null; till: string | null }
export type MaskinPlan = {
  maskin: KlarMaskin
  rader: PlanRad[]
  /** Sista traktens slutdag; null = saknar prognos, inga trakter eller räcker inte till de dagar som finns. */
  klar: string | null
  saknar: boolean
  efterManad: boolean
}

/** Maskinens kö: `trakter` är de som ligger på maskinen (i valfri ordning). */
export function raknaMaskin(m: KlarMaskin, trakter: KlarTrakt[], sistaArbetsdag: string): MaskinPlan {
  const ordnade = trakter.filter(t => arKvar(m, t)).sort((a, b) => a.sortn - b.sortn || (a.roll < b.roll ? -1 : a.roll > b.roll ? 1 : 0))
  const saknar = ordnade.some(t => dagarBehov(m, t) == null)
  // Som i SQL: summan av oavrundade dagar avrundas till 6 decimaler; "före" = avrundad summa − traktens egna dagar.
  let summa = 0
  const rader: PlanRad[] = ordnade.map(t => {
    const dg = dagarBehov(m, t)
    if (dg == null || saknar) return { trakt: t, dagar: dg, fran: null, till: null }
    summa += dg
    const slut = avrunda6(summa)
    const foer = avrunda6(slut - dg)
    return { trakt: t, dagar: dg, fran: m.dagar[Math.floor(foer)] ?? null, till: m.dagar[Math.max(Math.ceil(slut), 1) - 1] ?? null }
  })
  const klar = saknar || rader.length === 0 ? null : rader[rader.length - 1].till
  return { maskin: m, rader, klar, saknar, efterManad: klar != null && klar > sistaArbetsdag }
}

/** En tänkt omtilldelning: trakten (för rollen) får en annan maskin. null = ingen maskin. */
export type Flytt = { objekt_id: string; roll: KlarRoll; maskin_id: string | null }

/** Alla maskiners plan, med en tänkt flytt om man vill veta vad den ger. */
export function raknaAlla(d: KlarData, flytt?: Flytt): Record<string, MaskinPlan> {
  const trakter = flytt
    ? d.trakter.map(t => (t.objekt_id === flytt.objekt_id && t.roll === flytt.roll ? { ...t, maskin_id: flytt.maskin_id } : t))
    : d.trakter
  const ut: Record<string, MaskinPlan> = {}
  for (const m of d.maskiner) ut[m.maskin_id] = raknaMaskin(m, trakter.filter(t => t.maskin_id === m.maskin_id), d.sista_arbetsdag)
  return ut
}

/** Senaste klar-datum över alla maskiner som har ett. */
export function senasteKlar(planer: Record<string, MaskinPlan>): string | null {
  let s: string | null = null
  for (const p of Object.values(planer)) if (p.klar != null && (s == null || p.klar > s)) s = p.klar
  return s
}

/** Trakter vars roll saknar maskin bland våra kapacitetsmaskiner (ingen vald, eller en vi inte räknar på) — de får inte försvinna tyst. */
export function otilldelade(d: KlarData): KlarTrakt[] {
  const ids = new Set(d.maskiner.map(m => m.maskin_id))
  return d.trakter.filter(t => t.maskin_id == null || !ids.has(t.maskin_id))
}

/** Antal arbetsdagar maskinen behöver efter månadens sista arbetsdag ("3 dagar saknas"). */
export function dagarSaknas(p: MaskinPlan, sistaArbetsdag: string): number {
  if (p.klar == null) return 0
  return p.maskin.dagar.filter(x => x > sistaArbetsdag && x <= (p.klar as string)).length
}

// ── Flytt-förslaget ─────────────────────────────────────────────────────────
export type FlyttForslag = {
  objekt_id: string
  trakt: string
  roll: KlarRoll
  fran: KlarMaskin
  till: KlarMaskin
  /** Senaste klar-datum över alla maskiner OM flytten görs. */
  nyttKlar: string
  /** Hamnar det senaste datumet inom månaden (sista arbetsdagen)? Annars blir det bättre men inte i tid. */
  iTid: boolean
}

/**
 * Bästa enskilda flytt: EN trakt till EN annan maskin (av samma roll, som klarar typen) som ger tidigast SENASTE klar-datum
 * utan att göra någon annan maskin sen (en maskin som räckte får inte hamna efter månadens slut) eller okänd. Måste vara en förbättring
 * (nytt senaste datum < nuvarande). null = ingen flytt hjälper.
 */
export function bastaFlytt(d: KlarData): FlyttForslag | null {
  const nu = raknaAlla(d)
  const senast0 = senasteKlar(nu)
  if (senast0 == null || !Object.values(nu).some(p => p.efterManad)) return null
  let basta: FlyttForslag | null = null
  // Sist i kön först: vid lika bra flytt väljs den trakt som ligger sist (den som gör maskinen sen).
  for (const t of [...d.trakter].sort((a, b) => b.sortn - a.sortn)) {
    if (t.maskin_id == null) continue
    for (const till of d.maskiner) {
      if (till.roll !== t.roll || till.maskin_id === t.maskin_id || !kanTa(till, t)) continue
      const efter = raknaAlla(d, { objekt_id: t.objekt_id, roll: t.roll, maskin_id: till.maskin_id })
      const forsamrad = Object.keys(nu).some(id => (!nu[id].efterManad && efter[id].efterManad) || (!nu[id].saknar && efter[id].saknar))
      if (forsamrad) continue
      const nyttKlar = senasteKlar(efter)
      if (nyttKlar == null || nyttKlar >= senast0) continue
      if (basta == null || nyttKlar < basta.nyttKlar) {
        basta = { objekt_id: t.objekt_id, trakt: t.namn, roll: t.roll, fran: nu[t.maskin_id!].maskin, till, nyttKlar, iTid: nyttKlar <= d.sista_arbetsdag }
      }
    }
  }
  return basta
}

// ── Texter ──────────────────────────────────────────────────────────────────
/** "2026-12-03" → "3 december". */
export function fmtDagLang(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MANAD_NAMN[m - 1] ?? ''}`
}

/** Maskinens namn med bestämd form där vi vet den ("Elefant 26" → "Elefanten", "Wisent" → "Wisenten"); övriga namn står som de är. */
const BESTAMD: Record<string, string> = { elefant: 'Elefanten', wisent: 'Wisenten' }
export function bestamdNamn(namn: string): string {
  return BESTAMD[namn.trim().split(/\s+/)[0]?.toLowerCase() ?? ''] ?? namn
}

const capital = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`

/** Rollen som verb: "Vällust-skotningen". */
export const ROLL_SUBSTANTIV: Record<KlarRoll, string> = { skordare: 'skördningen', skotare: 'skotningen' }
export const ROLL_NAMN: Record<KlarRoll, string> = { skordare: 'skördare', skotare: 'skotare' }

export function flyttText(f: FlyttForslag): string {
  return `Flytta ${kortNamn(f.trakt)}-${ROLL_SUBSTANTIV[f.roll]} till ${bestamdNamn(f.till.namn)} → ${f.iTid ? 'alla klara' : 'sista klar'} ${fmtDag(f.nyttKlar)}`
}

export type ForraBestallning = { manadNamn: string; slutavverkning: number; gallring: number }

export type KlarSvar = {
  rubrik: string
  rad: string | null
  avvikelse: boolean
  /** Knappen under svarsraden: kopiera förra månadens beställning, eller öppna formuläret när det inte finns någon förra. */
  atgard: { slag: 'kopiera' | 'lagg_in'; text: string } | null
}

/** Trakterna (en gång per trakt) som saknar prognos för en roll de ska göras av våra maskiner. */
export function saknarPrognos(d: KlarData): KlarSparTrakt[] {
  const sett = new Set<string>()
  const ut: KlarSparTrakt[] = []
  for (const s of d.spar) for (const t of s.trakter) if (t.saknar_prognos && !sett.has(t.objekt_id)) { sett.add(t.objekt_id); ut.push({ ...t, volym: t.volym }) }
  return ut
}

/** Volymen som saknar trakt för en typ (beställt − trakter), aldrig negativ. */
export function saknarTrakt(s: KlarSpar): number {
  return Math.max(s.bestallt - s.trakt_volym, 0)
}

/** Svarsraden, prioritet uppifrån: beställning · prognos · maskin sen · volym utan trakt · allt ok. */
export function klarSvar(d: KlarData, forra: ForraBestallning | null): KlarSvar {
  const planer = raknaAlla(d)
  const manadNamn = capital(MANAD_NAMN[d.manad - 1] ?? '')
  // 1. Ingen beställning för månaden.
  if (!d.har_bestallning) {
    return {
      rubrik: 'Beställning saknas', rad: null, avvikelse: false,
      atgard: forra
        ? { slag: 'kopiera', text: `Samma som ${forra.manadNamn} · ${fmt(forra.slutavverkning)} · ${fmt(forra.gallring)}` }
        : { slag: 'lagg_in', text: 'Lägg in beställning' },
    }
  }
  // 2. Trakt utan prognos — orange först när trakten är mer än 10 % av beställt.
  const utan = saknarPrognos(d)
  if (utan.length > 0) {
    const stor = (t: KlarSparTrakt) => {
      const s = d.spar.find(x => x.trakter.some(y => y.objekt_id === t.objekt_id))
      return s != null && s.bestallt > 0 && t.volym / s.bestallt > 0.1
    }
    return {
      rubrik: utan.length === 1 ? `${kortNamn(utan[0].namn)} saknar prognos` : `${utan.length} trakter saknar prognos`,
      rad: 'Läggs i planeringsverktyget', avvikelse: utan.some(stor), atgard: null,
    }
  }
  // 3. Maskin klar efter månadens sista arbetsdag.
  const sena = Object.values(planer).filter(p => p.efterManad).sort((a, b) => (a.klar as string) < (b.klar as string) ? 1 : -1)
  if (sena.length > 0) {
    const varst = sena[0]
    const flytt = bastaFlytt(d)
    const saknas = dagarSaknas(varst, d.sista_arbetsdag)
    return {
      rubrik: `${bestamdNamn(varst.maskin.namn)} blir klar ${fmtDagLang(varst.klar as string)}`,
      rad: flytt ? flyttText(flytt) : `${saknas} ${saknas === 1 ? 'dag' : 'dagar'} saknas`,
      avvikelse: true, atgard: null,
    }
  }
  // 4. Trakter under beställt.
  const kort = d.spar.filter(s => s.bestallt > 0 && saknarTrakt(s) > 0).sort((a, b) => saknarTrakt(b) - saknarTrakt(a))
  if (kort.length > 0) {
    return { rubrik: `${TYP_NAMN[kort[0].typ]}: ${fmt(saknarTrakt(kort[0]))} m³fub saknar trakt`, rad: null, avvikelse: true, atgard: null }
  }
  // 5. Allt ok.
  const klara = Object.values(planer).filter(p => p.klar != null)
  return {
    rubrik: `${manadNamn} räcker`,
    rad: klara.length > 0 ? klara.map(p => `${bestamdNamn(p.maskin.namn)} ${fmtDag(p.klar as string)}`).join(' · ') : null,
    avvikelse: false, atgard: null,
  }
}

/** Underraden för en maskin i KLAR-listan: traktnamn i ordning, max tre, sedan "+2". */
export function maskinUnderrad(p: MaskinPlan): string {
  const namn = p.rader.map(r => kortNamn(r.trakt.namn))
  return namn.length <= 3 ? namn.join(', ') : `${namn.slice(0, 3).join(', ')} +${namn.length - 3}`
}

/** Vad står till höger om maskinen i KLAR-listan. */
export type KlarHoger = { text: string; ton: 'normal' | 'orange' | 'muted' }
export function maskinHoger(p: MaskinPlan): KlarHoger {
  if (p.rader.length === 0) return { text: '–', ton: 'muted' }
  if (p.saknar) return { text: '?', ton: 'muted' }
  if (p.klar == null) return { text: '–', ton: 'muted' }
  return { text: fmtDag(p.klar), ton: p.efterManad ? 'orange' : 'normal' }
}

/** Arket "Byt maskin": en rad per maskin som klarar typen, med hennes klar-datum OM hon får trakten (allt annat oförändrat). */
export type ValRad = { maskin: KlarMaskin; nuvarande: boolean; klar: string | null; saknar: boolean; efterManad: boolean }
export function valForTrakt(d: KlarData, objektId: string, r: KlarRoll): ValRad[] {
  const t = d.trakter.find(x => x.objekt_id === objektId && x.roll === r)
  if (!t) return []
  return d.maskiner
    .filter(m => m.roll === r && kanTa(m, t))
    .map(m => {
      const p = raknaAlla(d, { objekt_id: objektId, roll: r, maskin_id: m.maskin_id })[m.maskin_id]
      return { maskin: m, nuvarande: t.maskin_id === m.maskin_id, klar: p.klar, saknar: p.saknar, efterManad: p.efterManad }
    })
}
