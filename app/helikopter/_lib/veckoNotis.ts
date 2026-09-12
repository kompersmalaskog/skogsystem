// Onsdagsnotisen: veckoläget per spår som ren text. Ren funktion — inga imports av
// React eller Supabase, testad i veckoNotis.test.ts.
//
// Datan är payloaden som helikopter_notis_vecka() (migration 20260912110200) lägger
// i notis_kö: rådata ur samma SQL-funktioner som vyn. Texten byggs vid utskick i
// app/api/notis/flush (byggMeddelande), samma väg som dagsslut och månadsskifte.
// Siffrorna räknas med raknaSpar/valjBas — samma som Läge/Uppföljning.
//
// Format per spår med beställning (fem rader, inget mer):
//   Vecka 37 · Slutavverkning · 5 000 till Vida
//   Skördat 2 675 · skotat 1 265 · 4 dagar efter plan        (på plan: "· på plan")
//   Veckan hittills: plan 682, skördat 697, skotat 374        (plan = veckoplan × gångna/arbetsdagar i veckan)
//   Kör 184/dag · behöver 287 · landar ca 2 400               (skotat: takt, behov, prognos)
//   Skotaren är flaskhals: Elephant King 114/dag på Stänkelsmåla · Wisent 63/dag på Rössmåla   (bara efter plan)
// Spår utan objekt: rad 2 = "Inga objekt planerade", inget mer. Aktiv maskin utan data de
// senaste två arbetsdagarna: egen rad "Wisent · inga lass sedan måndag". Två spår = två
// block med tom rad emellan. Ingen inledning, ingen avslutning, inga råd.
import { PROGNOS_FRAN_ARBETSDAG, TYP_NAMN, raknaSpar, valjBas, type SparLage } from './berakningar'
import { MANAD_NAMN, dagarText, fmt, fmtDag, kortNamn } from './format'
import type { Arbetsdagar, MaskinManad, SparRad, Typ, VeckaRad } from './queries'

export type VeckoNotisMaskin = MaskinManad & {
  /** lower(huvudtyp) på maskinens senaste objekt — styr vilket block "utan data"-raden hamnar i. */
  objekt_typ: string | null
  /** Maskinens egna arbetsdagar i månaden t.o.m. i dag (stopp borträknade). */
  dagar_tom_idag: string[]
}

export type VeckoNotisData = {
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
  maskiner: VeckoNotisMaskin[]
}

/** Spårens ordning i notisen: slutavverkning först, sedan gallring. */
const ORDNING: Typ[] = ['slutavverkning', 'gallring']
const VECKODAG = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag']
const TOM_DAGAR: Arbetsdagar = { maskin_id: null, totalt: 0, gangna: 0, kvar: 0, gangna_datum: [], kvar_datum: [] }

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

function veckodag(iso: string): string {
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
export function saknarData(m: Pick<VeckoNotisMaskin, 'senast_datum' | 'dagar_tom_idag'>, globalaDagar: string[]): boolean {
  const dagar = m.dagar_tom_idag.length > 0 ? m.dagar_tom_idag : globalaDagar
  if (dagar.length < 2) return false
  const forstaAvDeTva = dagar[dagar.length - 2]
  return !m.senast_datum || m.senast_datum < forstaAvDeTva
}

function sparRader(s: SparLage, d: VeckoNotisData): string[] {
  const rader = [`Vecka ${d.isovecka} · ${TYP_NAMN[s.typ]} · ${fmt(s.bestallt)}${bolagText(s.bolag)}`]
  if ((d.planerade[s.typ] ?? 0) === 0) {
    rader.push('Inga objekt planerade')
    return rader
  }

  // Rad 2: månadens skördat/skotat och läget mot plan (skotat mot plan idag, som Läge).
  const lage = s.lage
  const lageText = lage == null
    ? `prognos från arbetsdag ${PROGNOS_FRAN_ARBETSDAG}`
    : lage.status === 'pa_plan' ? 'på plan'
    : `${dagarText(lage.dagar)} ${lage.status === 'efter' ? 'efter' : 'före'} plan`
  rader.push(`Skördat ${fmt(s.skordat)} · skotat ${fmt(s.skotat)} · ${lageText}`)

  // Rad 3: veckan hittills. Plan = veckoplan × (arbetsdagar gångna i veckan / arbetsdagar i veckan).
  const v = d.veckor[s.typ]
  if (v) {
    const plan = v.plan != null && v.arbetsdagar > 0 ? `plan ${fmt(v.plan * (d.vecka_gangna / v.arbetsdagar))}, ` : ''
    rader.push(`Veckan hittills: ${plan}skördat ${fmt(v.skordat)}, skotat ${fmt(v.skotat)}`)
  }

  // Rad 4: takt, behov och prognos för skotat — finns bara när prognosen finns (från arbetsdag 4).
  if (s.harPrognos && s.taktSkotat != null && s.prognosSkotat != null) {
    const behov = s.behovPerDag != null ? ` · behöver ${fmt(s.behovPerDag)}` : ''
    rader.push(`Kör ${fmt(s.taktSkotat)}/dag${behov} · landar ca ${ca(s.prognosSkotat)}`)
  }

  // Rad 5: bara efter plan, bara rollen som ligger efter. Mer än en dags skotning oskotat
  // = skotaren är flaskhals (samma regel som Uppföljning), annars skördaren.
  if (lage?.status === 'efter') {
    const skotaren = s.oskotat > (s.taktSkotat ?? 0)
    const roll = skotaren ? 'skotare' : 'skordare'
    const lista = d.maskiner
      .filter(m => m.roll === roll && m.takt_per_dag != null)
      .map(m => `${m.namn} ${fmt(m.takt_per_dag as number)}/dag${m.objekt_namn ? ` på ${kortNamn(m.objekt_namn)}` : ''}`)
    if (lista.length > 0) rader.push(`${skotaren ? 'Skotaren' : 'Skördaren'} är flaskhals: ${lista.join(' · ')}`)
  }
  return rader
}

export function formateraVeckoNotis(d: VeckoNotisData): string {
  const manadNamn = MANAD_NAMN[d.manad - 1] ?? ''
  const dagar = d.dagar ?? TOM_DAGAR
  const block: { typ: Typ; rader: string[] }[] = []
  for (const typ of ORDNING) {
    const bas = valjBas(d.spar, typ)
    if (!bas || bas.bestallt <= 0) continue
    block.push({ typ, rader: sparRader(raknaSpar(bas, dagar), d) })
  }
  if (block.length === 0) return `Ingen beställning inlagd i ${manadNamn}`

  // Maskin utan data: i blocket för maskinens senaste objekts typ, annars första blocket.
  for (const m of d.maskiner) {
    if (!saknarData(m, d.dagar_tom_idag)) continue
    const mal = block.find(b => b.typ === m.objekt_typ) ?? block[0]
    mal.rader.push(`${m.namn} · ${m.roll === 'skotare' ? 'inga lass' : 'ingen produktion'} ${sedanText(m.senast_datum, d.idag, manadNamn)}`)
  }
  return block.map(b => b.rader.join('\n')).join('\n\n')
}
