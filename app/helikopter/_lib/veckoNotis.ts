// Onsdagsnotisen: veckoläget per spår som ren text. Ren funktion — inga imports av
// React eller Supabase, testad i veckoNotis.test.ts.
//
// Datan är payloaden som helikopter_notis_vecka() (migration 20260912110200, payload ur helikopter_veckolage sedan 20260913100000) lägger
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
import { MANAD_NAMN, dagarText, fmt, kortNamn } from './format'
import type { Typ } from './queries'
import { ORDNING, TOM_DAGAR, bolagText, ca, saknarData, sedanText, utanDataRad, type VeckolageData, type VeckolageMaskin } from './veckolage'

// Payload-typen och hjälpfunktionerna delas med sidan /helikopter/veckolage (veckolage.ts).
export type VeckoNotisData = VeckolageData
export type VeckoNotisMaskin = VeckolageMaskin
export { bolagText, ca, saknarData, sedanText }

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
    mal.rader.push(utanDataRad(m, d.idag, manadNamn))
  }
  return block.map(b => b.rader.join('\n')).join('\n\n')
}
