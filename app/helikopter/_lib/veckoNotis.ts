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
//   Skördat landar 2 400 · skotat landar 2 000 av 5 000 · om takten håller   (prognos mot beställt per roll; före arbetsdag 4: hittills)
//   Veckan hittills: plan 682, skördat 697, skotat 374        (plan = veckoplan × gångna/arbetsdagar i veckan)
//   Kör 184/dag · behöver 287                                 (skotarens takt och behov; var det landar står på rad 2)
//   Giant stod 3 dagar (Stefan ledig) · Elefant 26 står 26–30 okt (Daniel ledig)   (bara när en av spårets maskiner har ett stopp)
//   Skotaren är flaskhals: Elephant King 114/dag på Stänkelsmåla · Wisent 63/dag på Rössmåla   (bara när en roll landar under beställt)
// Spår utan objekt: rad 2 = "Inga objekt planerade", inget mer. Aktiv maskin utan data de
// senaste två arbetsdagarna: egen rad "Wisent · inga lass sedan måndag". Två spår = två
// block med tom rad emellan. Ingen inledning, ingen avslutning, inga råd.
import { PROGNOS_FRAN_ARBETSDAG, TYP_NAMN, landarRoller, raknaSpar, stoppNotisText, valjBas, type SparLage } from './berakningar'
import { MANAD_NAMN, fmt, kortNamn } from './format'
import type { SparRad, Typ } from './queries'
import { ORDNING, TOM_DAGAR, bolagText, ca, flaskRoll, saknarData, sedanText, utanDataRad, type VeckolageData, type VeckolageMaskin } from './veckolage'

// Payload-typen och hjälpfunktionerna delas med sidan /helikopter/veckolage (veckolage.ts).
export type VeckoNotisData = VeckolageData
export type VeckoNotisMaskin = VeckolageMaskin
export { bolagText, ca, saknarData, sedanText }


/**
 * Spårens skördat/skotat/takt från helikopter_ny_bolag — samma tal som Veckor och Per bolag, MED egen skotning (markägaren skotar: räknas på skördad volym).
 * helikopter_ny_spar lämnar egen skotning utanför (tavlan lägger till den själv i TypeScript), så gallring stod på 38 skördat fast 848 var fällt (2026-11-25).
 * Bara bolag med beställning (lovat > 0) räknas, som spårets "bestallt"-bas. Prognosen räknas då på spårets takt × dagar kvar (inte per maskin: maskinernas
 * takt lämnar också egen skotning utanför, och skördaren på en egen-skotning-trakt stod på 0/dag). Saknas bolag-raderna (äldre köade payloads) lämnas spåren orörda.
 */
export function spararMedBolag(d: VeckoNotisData): { spar: SparRad[]; takt: VeckoNotisData['takt'] } {
  const rader = (d.bolag ?? []).filter(b => b.lovat > 0)
  if (rader.length === 0) return { spar: d.spar, takt: d.takt }
  const spar = d.spar.map((s): SparRad => {
    if (s.bas !== 'bestallt') return s
    const r = rader.filter(b => b.typ === s.typ)
    if (r.length === 0) return s
    const summa = (f: (b: (typeof r)[number]) => number | null) => r.some(b => f(b) != null) ? r.reduce((a, b) => a + (f(b) ?? 0), 0) : null
    return {
      ...s,
      skordat: r.reduce((a, b) => a + b.skordat, 0),
      skotat: r.reduce((a, b) => a + b.skotat, 0),
      takt_skordat: summa(b => b.takt_skordat),
      takt_skotat: summa(b => b.takt_skotat),
      takt_dagar: Math.max(...r.map(b => b.takt_dagar)),
    }
  })
  return { spar, takt: undefined }
}

function sparRader(s: SparLage, d: VeckoNotisData): string[] {
  const rader = [`Vecka ${d.isovecka} · ${TYP_NAMN[s.typ]} · ${fmt(s.bestallt)}${bolagText(s.bolag)}`]
  if ((d.planerade[s.typ] ?? 0) === 0) {
    rader.push('Inga objekt planerade')
    return rader
  }

  // Rad 2: var spåret landar, per roll (prognos = hittills + takt × dagar kvar) — "av 1 000" en gång. Före arbetsdag 4 finns ingen prognos: hittills.
  const roller = landarRoller(s)
  rader.push(roller
    ? `Skördat landar ${fmt(roller[0].landar)} · skotat landar ${fmt(roller[1].landar)} av ${fmt(s.bestallt)} · om takten håller`
    : `Skördat ${fmt(s.skordat)} · skotat ${fmt(s.skotat)} · prognos från arbetsdag ${PROGNOS_FRAN_ARBETSDAG}`)

  // Rad 3: veckan hittills. Plan = veckoplan × (arbetsdagar gångna i veckan / arbetsdagar i veckan).
  const v = d.veckor[s.typ]
  if (v) {
    const plan = v.plan != null && v.arbetsdagar > 0 ? `plan ${fmt(v.plan * (d.vecka_gangna / v.arbetsdagar))}, ` : ''
    rader.push(`Veckan hittills: ${plan}skördat ${fmt(v.skordat)}, skotat ${fmt(v.skotat)}`)
  }

  // Rad 4: skotarens takt och behov — finns bara när prognosen finns (från arbetsdag 4). Var det landar står redan på rad 2.
  if (s.harPrognos && s.taktSkotat != null && s.prognosSkotat != null) {
    const behov = s.behovPerDag != null ? ` · behöver ${fmt(s.behovPerDag)}` : ''
    rader.push(`Kör ${fmt(s.taktSkotat)}/dag${behov}`)
  }

  // Rad 4b: stopp som orsak i klartext (planerat stopp = ledig förare utan fil): "Giant stod 3 dagar (Stefan ledig) · Elefant 26 står 26–30 okt (Daniel ledig)".
  // Bara maskinerna som kört i spåret, ingen rankning.
  const stopp = stoppNotisText(d.stopp, s.maskinIds)
  if (stopp) rader.push(stopp)

  // Rad 5: bara när någon roll landar under beställt, bara rollen som ligger sämst till (flaskRoll i veckolage.ts).
  const flask = flaskRoll(s)
  if (flask) {
    const skotaren = flask === 'skotare'
    const roll = flask
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
  const { spar, takt } = spararMedBolag(d)
  for (const typ of ORDNING) {
    const bas = valjBas(spar, typ)
    if (!bas || bas.bestallt <= 0) continue
    block.push({ typ, rader: sparRader(raknaSpar(bas, dagar, takt), d) })
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

// ── Kort version till alla (Martin 2026-11-25) ─────────────────────────────
// Onsdagsnotisen går till ALLA aktiva medarbetare, inte bara admin. Lagets läge, inga namn: ingen maskin, ingen förare, ingen frånvaro,
// ingen "inga lass sedan" (det är ett larm till admin, och pekar ut en förare). Per spår: räcker eller fattas, och per ROLL (skördare/skotare)
// takt mot behov — rollens takt är summan av maskinerna i den. Titeln är läget i några ord så det syns utan att öppna.
//
//   Gallring släpar                                  (titel)
//   Slutavverkning · Vida: ✓ räcker
//   Skördare 203/dag · behövs 0 ✓
//   Skotare 310/dag · behövs 250 ✓
//   Gallring · Vida: ● fattas 120
//   Skördare 95/dag · behövs 94 ✓
//   Skotare 65/dag · behövs 94 ●
//   Räknat på takten senaste 5 arbetsdagarna.        (bara när en prognos finns)
//
// Prognosen räknar med nuvarande takt — byter maskinerna trakt kan den ändras (planeringen har inget datum för trakbyte att skriva ut).
// Därför står raden om takten sist. Ingen beställning: "Ingen beställning inlagd i <månad>".
export type NotisVersion = 'full' | 'kort'

type KortBlock = { typ: Typ; rader: string[]; fattas: number; prognos: boolean }

/** Takten är medeltalet av maskinens senaste 5 arbetsdagar med körning (takt_fonster). */
const TAKT_ARBETSDAGAR = 5

function rollNamn(roll: 'skordat' | 'skotat'): string {
  return roll === 'skordat' ? 'Skördare' : 'Skotare'
}

function kortBlock(s: SparLage, d: VeckoNotisData): KortBlock {
  const bolag = s.bolag.map(b => b.trim()).filter(Boolean).join(' och ')
  const namn = `${TYP_NAMN[s.typ]}${bolag ? ` · ${bolag}` : ''}`
  if ((d.planerade[s.typ] ?? 0) === 0) return { typ: s.typ, rader: [`${namn}: inga objekt planerade`], fattas: 0, prognos: false }

  const roller = landarRoller(s)
  if (!roller) {
    return { typ: s.typ, rader: [`${namn}: prognos från arbetsdag ${PROGNOS_FRAN_ARBETSDAG}`, `Skördat ${fmt(s.skordat)} · skotat ${fmt(s.skotat)} av ${fmt(s.bestallt)}`], fattas: 0, prognos: false }
  }
  // Fattas = hur mycket den sämsta rollen landar under beställt (avrundade tal, som i vyn).
  const fattas = Math.max(0, ...roller.map(r => (r.under ? s.bestallt - Math.round(r.landar) : 0)))
  const rader = [`${namn}: ${fattas > 0 ? `● fattas ${fmt(fattas)}` : '✓ räcker'}`]
  for (const r of roller) {
    const tecken = r.under ? '●' : '✓'
    if (r.framme) rader.push(`${rollNamn(r.roll)} klar ✓`)
    else if (r.takt == null || r.behov == null) rader.push(`${rollNamn(r.roll)} ${tecken}`)
    else rader.push(`${rollNamn(r.roll)} ${fmt(r.takt)}/dag · behövs ${fmt(r.behov)} ${tecken}`)
  }
  return { typ: s.typ, rader, fattas, prognos: true }
}

function kortBlockAlla(d: VeckoNotisData): KortBlock[] {
  const dagar = d.dagar ?? TOM_DAGAR
  const block: KortBlock[] = []
  const { spar, takt } = spararMedBolag(d)
  for (const typ of ORDNING) {
    const bas = valjBas(spar, typ)
    if (!bas || bas.bestallt <= 0) continue
    block.push(kortBlock(raknaSpar(bas, dagar, takt), d))
  }
  return block
}

/** Titeln: läget i några ord. */
export function veckoNotisTitel(d: VeckoNotisData, version: NotisVersion): string {
  if (version === 'full') return 'Veckoläge'
  const block = kortBlockAlla(d)
  if (block.length === 0) return 'Veckoläge'
  const under = block.filter(b => b.fattas > 0)
  if (under.length === 0) return block.some(b => b.prognos) ? 'Vi hänger med' : 'Veckoläge'
  if (under.length === 1) return `${TYP_NAMN[under[0].typ]} släpar`
  return 'Båda spåren släpar'
}

export function formateraVeckoNotisKort(d: VeckoNotisData): string {
  const manadNamn = MANAD_NAMN[d.manad - 1] ?? ''
  const block = kortBlockAlla(d)
  if (block.length === 0) return `Ingen beställning inlagd i ${manadNamn}`
  const text = block.map(b => b.rader.join('\n')).join('\n\n')
  return block.some(b => b.prognos) ? `${text}\n\nRäknat på takten senaste ${TAKT_ARBETSDAGAR} arbetsdagarna.` : text
}
