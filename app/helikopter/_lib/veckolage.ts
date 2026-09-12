// Veckoläget — datan ur helikopter_veckolage(p_idag) (migration 20260913100000) och den
// rena vymodellen som sidan /helikopter/veckolage, PDF:en, bilden och onsdagsnotisen
// (veckoNotis.ts) bygger på. Inga imports av React eller Supabase; testad i
// veckolage.test.ts. Siffrorna räknas med raknaSpar/valjBas — samma som Läge/Uppföljning.
import { PROGNOS_FRAN_ARBETSDAG, TYP_NAMN, dagarEfter, raknaSpar, valjBas, type Lage, type SparLage } from './berakningar'
import { MANAD_NAMN, dagarText, fmt, fmtDag, kortNamn } from './format'
import type { Arbetsdagar, MaskinManad, SparRad, Typ, VeckaRad } from './queries'

// ── Payloaden ur SQL ────────────────────────────────────────────────────────
export type VeckolageMaskin = MaskinManad & {
  /** lower(huvudtyp) på maskinens senaste objekt — styr vilket spår en "utan data"-rad hör till. */
  objekt_typ: string | null
  /** Maskinens egna arbetsdagar i månaden t.o.m. i dag (stopp borträknade). */
  dagar_tom_idag: string[]
}

export type VeckolageData = {
  idag: string
  ar: number
  manad: number
  isovecka: number
  /** Månadens globala arbetsdagar (helikopter_ny_arbetsdagar, maskin_id null). */
  dagar: Arbetsdagar | null
  /** Månadens arbetsdagar t.o.m. i dag (i dag räknas). */
  dagar_tom_idag: string[]
  /** Arbetsdagar i innevarande ISO-vecka t.o.m. i dag. */
  vecka_gangna: number
  spar: SparRad[]
  /** Pågående vecka per spår (helikopter_ny_veckor, status 'pagar'). */
  veckor: Partial<Record<Typ, VeckaRad | null>>
  /** Antal objekt i månaden per spår (helikopter_ny_planering). */
  planerade: Partial<Record<Typ, number>>
  maskiner: VeckolageMaskin[]
}

// ── Gemensamma hjälpfunktioner (sidan + notisen) ────────────────────────────
/** Spårens ordning: slutavverkning först, sedan gallring. */
export const ORDNING: Typ[] = ['slutavverkning', 'gallring']
const VECKODAG = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag']
export const TOM_DAGAR: Arbetsdagar = { maskin_id: null, totalt: 0, gangna: 0, kvar: 0, gangna_datum: [], kvar_datum: [] }

/** " till Vida" · " till Vida och Södra" · " till Vida, Södra och Privat". Tomt utan bolag. */
export function bolagText(bolag: string[]): string {
  const b = bolag.filter(x => x && x.trim()).map(x => x.trim())
  if (b.length === 0) return ''
  if (b.length === 1) return ` till ${b[0]}`
  return ` till ${b.slice(0, -1).join(', ')} och ${b[b.length - 1]}`
}

/** "ca 2 400": närmaste hundratal. */
export function ca(n: number): string {
  return fmt(Math.round(n / 100) * 100)
}

export function veckodag(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return VECKODAG[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/** "sedan måndag" inom en vecka bakåt, annars "sedan 3 sep"; utan datum alls "i september". */
export function sedanText(senast: string | null, idag: string, manadNamn: string): string {
  if (!senast) return `i ${manadNamn}`
  const dagar = Math.round((Date.parse(idag) - Date.parse(senast)) / 86400000)
  return dagar >= 0 && dagar <= 6 ? `sedan ${veckodag(senast)}` : `sedan ${fmtDag(senast)}`
}

/** Aktiv maskin utan fakt-data någon av de två senaste arbetsdagarna (maskinens egna, t.o.m. i dag). Färre än två dagar: går inte att avgöra → false. */
export function saknarData(m: Pick<VeckolageMaskin, 'senast_datum' | 'dagar_tom_idag'>, globalaDagar: string[]): boolean {
  const dagar = m.dagar_tom_idag.length > 0 ? m.dagar_tom_idag : globalaDagar
  if (dagar.length < 2) return false
  const forstaAvDeTva = dagar[dagar.length - 2]
  return !m.senast_datum || m.senast_datum < forstaAvDeTva
}

/** "Wisent · inga lass sedan måndag" / "Ponsse Scorpion · ingen produktion sedan fredag". */
export function utanDataRad(m: VeckolageMaskin, idag: string, manadNamn: string): string {
  return `${m.namn} · ${m.roll === 'skotare' ? 'inga lass' : 'ingen produktion'} ${sedanText(m.senast_datum, idag, manadNamn)}`
}

// ── Vymodellen för sidan, PDF:en och bilden ─────────────────────────────────
export type Ton = 'gron' | 'orange' | 'neutral' | 'dampad'

export type SparVy = {
  typ: Typ
  /** Rubrik: "Slutavverkning · 5 000 m³fub till Vida" — volymen fet. Utan beställning: volym null, bolag " · ingen beställning". */
  rubrik: { typNamn: string; volym: string | null; bolag: string }
  /** Stort tal: "4 dagar efter" (orange) / "På plan" / "2 dagar före" (grön) / "Inga objekt" (dämpad). liten = text i stället för tal. */
  stort: { text: string; ton: Ton; liten: boolean }
  /** "Landar ca 2 400 av 5 000" / "Skotat 487 · skotar ut föregående månad · skördaren har inget planerat". */
  mening: string
  skordat: { tal: string; under: string | null; ton: Ton }
  skotat: { tal: string; under: string | null; ton: Ton }
  /** Bara när någon roll ligger efter. rader = maskinerna i den rollen (takt på objekt, eller "inga lass sedan …"). */
  flaskhals: { rubrik: string; rader: string[] } | null
  /** "Veckan hittills: plan 682 · skördat 697 · skotat 374". null utan pågående vecka. */
  veckan: string | null
}

export type Veckolage = {
  ar: number
  isovecka: number
  /** "Onsdag 16 sep · vecka 38 · 11 arbetsdagar kvar". */
  datumRad: string
  spar: SparVy[]
  /** "Kompersmåla Skog · Veckoläge vecka 38 · 16 sep 2026". */
  sidfot: string
  /** "veckolage-2026-v38" — utan filändelse. */
  filnamn: string
}

/** Så många tecken får maskinraden i flaskhalsrutan vara på EN rad (14 px på 390 px); annars en rad per maskin. */
export const FLASKHALS_RAD_MAX_TECKEN = 44

/** "4 dagar efter" / "på plan" / "2 dagar före". */
function lageKort(l: Lage | null): string | null {
  if (!l) return null
  if (l.status === 'pa_plan') return 'på plan'
  return `${dagarText(l.dagar)} ${l.status === 'efter' ? 'efter' : 'före'}`
}

function stortTal(s: SparLage, ingenBest: boolean, ingaObjekt: boolean): SparVy['stort'] {
  if (ingenBest) return { text: 'Ingen beställning', ton: 'dampad', liten: true }
  if (ingaObjekt) return { text: 'Inga objekt', ton: 'dampad', liten: false }
  if (!s.harPrognos || !s.lage) return { text: `Prognos från dag ${PROGNOS_FRAN_ARBETSDAG}`, ton: 'dampad', liten: true }
  if (s.lage.status === 'efter') return { text: `${dagarText(s.lage.dagar)} efter`, ton: 'orange', liten: false }
  if (s.lage.status === 'fore') return { text: `${dagarText(s.lage.dagar)} före`, ton: 'gron', liten: false }
  return { text: 'På plan', ton: 'gron', liten: false }
}

function mening(s: SparLage, ingenBest: boolean, ingaObjekt: boolean): string {
  if (ingenBest) return `Skördat ${fmt(s.skordat)} · skotat ${fmt(s.skotat)}`
  if (ingaObjekt) return `Skotat ${fmt(s.skotat)}${s.skotat > 0 ? ' · skotar ut föregående månad' : ''} · skördaren har inget planerat`
  if (!s.harPrognos || s.prognosSkotat == null) return `Skotat ${fmt(s.skotat)} av ${fmt(s.bestallt)}`
  return `Landar ca ${ca(s.prognosSkotat)} av ${fmt(s.bestallt)}`
}

/**
 * Flaskhalsrutan — bara när spåret (skotat mot plan, det stora talet) ligger efter; på plan
 * = ingen ruta. Rollen: skotaren om mer än en dags skotning ligger oskotat (samma regel som
 * Uppföljning), annars skördaren (skotaren har inget att hämta).
 */
function flaskhals(s: SparLage, kvar: number, maskiner: VeckolageMaskin[], globalaDagar: string[], idag: string, manadNamn: string): SparVy['flaskhals'] {
  if (s.lage?.status !== 'efter') return null
  const roll: 'skotare' | 'skordare' = s.oskotat > (s.taktSkotat ?? 0) ? 'skotare' : 'skordare'

  const namn = roll === 'skotare' ? 'Skotarna' : 'Skördarna'
  const gjort = roll === 'skotare' ? s.skotat : s.skordat
  const takt = roll === 'skotare' ? s.taktSkotat : s.taktSkordat
  const behov = kvar > 0 ? Math.max(0, s.bestallt - gjort) / kvar : null
  let rubrik: string
  if (behov != null && takt != null && behov - takt > 0) rubrik = `${namn} saknar ${fmt(behov - takt)} m³fub/dag`
  else if (behov != null && takt != null) rubrik = `${namn} kör ${fmt(takt)}/dag · behöver ${fmt(behov)}`
  else rubrik = `${namn} ligger efter`

  const medTakt: string[] = []
  const utanData: string[] = []
  for (const m of maskiner) {
    if (m.roll !== roll) continue
    if (saknarData(m, globalaDagar)) utanData.push(utanDataRad(m, idag, manadNamn))
    else if (m.takt_per_dag != null) medTakt.push(`${m.namn} ${fmt(m.takt_per_dag)}${m.objekt_namn ? ` på ${kortNamn(m.objekt_namn)}` : ''}`)
  }
  const enRad = medTakt.join(' · ')
  const rader = medTakt.length > 0 && enRad.length <= FLASKHALS_RAD_MAX_TECKEN ? [enRad] : medTakt
  return { rubrik, rader: [...rader, ...utanData] }
}

function sparVy(s: SparLage, d: VeckolageData, dagar: Arbetsdagar, manadNamn: string): SparVy {
  const ingenBest = s.bestallt <= 0
  const ingaObjekt = !ingenBest && (d.planerade[s.typ] ?? 0) === 0
  // Lägen (text + färg) i rutorna bara med beställning, objekt och prognos.
  const lagen = !ingenBest && !ingaObjekt && s.harPrognos
  const skordatLage = lagen ? dagarEfter(s.plan, s.skordat, s.taktSkordat) : null
  const skotatLage = lagen ? s.lage : null
  const av = ingenBest ? null : `av ${fmt(s.bestallt)}`
  const under = (l: Lage | null) => (av == null ? null : `${av}${lageKort(l) ? ` · ${lageKort(l)}` : ''}`)
  const v = d.veckor[s.typ]
  const veckoPlan = v && v.plan != null && v.arbetsdagar > 0 && !ingenBest ? `plan ${fmt(v.plan * (d.vecka_gangna / v.arbetsdagar))} · ` : ''
  return {
    typ: s.typ,
    rubrik: { typNamn: TYP_NAMN[s.typ], volym: ingenBest ? null : `${fmt(s.bestallt)} m³fub`, bolag: ingenBest ? ' · ingen beställning' : bolagText(s.bolag) },
    stort: stortTal(s, ingenBest, ingaObjekt),
    mening: mening(s, ingenBest, ingaObjekt),
    skordat: { tal: fmt(s.skordat), under: under(skordatLage), ton: skordatLage?.status === 'efter' ? 'orange' : 'neutral' },
    skotat: { tal: fmt(s.skotat), under: under(skotatLage), ton: skotatLage?.status === 'efter' ? 'orange' : 'neutral' },
    flaskhals: lagen ? flaskhals(s, dagar.kvar, d.maskiner, d.dagar_tom_idag, d.idag, manadNamn) : null,
    veckan: v ? `Veckan hittills: ${veckoPlan}skördat ${fmt(v.skordat)} · skotat ${fmt(v.skotat)}` : null,
  }
}

/** Spår som visas: beställning i månaden, eller produktion utan beställning (då bara talen). */
export function veckolageModell(d: VeckolageData): Veckolage {
  const manadNamn = MANAD_NAMN[d.manad - 1] ?? ''
  const dagar = d.dagar ?? TOM_DAGAR
  const spar: SparVy[] = []
  for (const typ of ORDNING) {
    const bas = valjBas(d.spar, typ)
    if (!bas) continue
    if (bas.bestallt <= 0 && bas.skordat + bas.skotat <= 0) continue
    spar.push(sparVy(raknaSpar(bas, dagar), d, dagar, manadNamn))
  }
  const vd = veckodag(d.idag)
  return {
    ar: d.ar,
    isovecka: d.isovecka,
    datumRad: `${vd.charAt(0).toUpperCase()}${vd.slice(1)} ${fmtDag(d.idag)} · vecka ${d.isovecka} · ${dagarText(dagar.kvar).replace(/dag(ar)?$/, m => `arbets${m}`)} kvar`,
    spar,
    sidfot: `Kompersmåla Skog · Veckoläge vecka ${d.isovecka} · ${fmtDag(d.idag)} ${d.ar}`,
    filnamn: `veckolage-${d.ar}-v${d.isovecka}`,
  }
}
