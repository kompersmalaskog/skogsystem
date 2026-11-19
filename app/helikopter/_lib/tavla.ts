// TAVLAN — helikopterns förstasida (Martin 2026-11-16: "hur ligger vi till mot beställningen, hur går det för varje maskin, hur ser prognosen ut").
//
// Ett kort per spår (slutavverkning, gallring) med två block: Skördat och Skotat. I varje block en rad per maskin med två tal:
//   NU     = det maskinen gjort i månaden (helikopter_ny_takt.volym_manad — samma lass och stammar som spårets summa)
//   LANDAR = nu + det maskinens KÖ hinner före månadens sista arbetsdag
// Landar räknas på prognosen PER TRAKT i körordning (samma underlag som klar-datumen: planerarens prognos, annars appens G15-förslag,
// och uppmätt takt när maskinen börjat) — ALDRIG takt × dagar: en seg trakt eller en slutspurt ligger redan i traktens egen prognos.
// Sist i blocket: summan mot beställt ("Hinner" / "Fattas ca 800" / "1 200 över").
//
// Regler:
//  · en trakt som slutar efter månadens sista arbetsdag räknas med den DEL som hinns (dagar i månaden / traktens dagar);
//  · en trakt utan prognos (GROT, eller inget förslag) tar noll dagar i räkningen och märker maskinens tal som osäkert ("ca") — den göms aldrig;
//  · egen skotning (markägaren skotar, Martin 2026-11-16): SKÖRDAREN har gjort jobbet, så volymen räknas i Skördat som allt annat.
//    Skotningen är inte vår: den står på EN rad "Markägaren skotar" under Skotat (det skördaren fällt där), räknas in i summan —
//    alltså minskar vårt eget mål med den volymen — och är aldrig "ingen maskin";
//  · trakter utan maskin räknas inte in i Landar — de står som egna rader, och ett tryck ger dem en maskin;
//  · summan är summan av de avrundade raderna som visas.
// Inga imports av React eller Supabase.
import { TYP_NAMN, oskotatKvar, type ManadStatus, type SparLage } from './berakningar'
import { fmt, fmtDag, kortNamn } from './format'
import { KLAR_TYP_NAMN, MATT_VISA_FRAN, arVirke, dagarBehov, kanValjas, type Flytt, type KlarData, type KlarMaskin, type KlarRoll, type KlarTrakt } from './klar'
import type { Typ } from './queries'
import type { Ton } from './kort'

/** Mer än så här över beställt på skördat sägs (Martin: "vi får inte producera hur mycket som helst"). */
export const OVER_GRANS = 0.05

export type TavlaUtfall = { typ: Typ; maskin_id: string; roll: KlarRoll; volym: number }
/** Skördat i månaden på trakter med egen skotning, per spår och skördare (spårets egna tal räknar inte med dem). */
export type TavlaEgetSkordat = { typ: Typ; maskin_id: string; volym: number }
/** Valet "Egen skotning" i Vem ska ta den? */
export const EGEN_SKOTNING = 'egen'

/** Allt en maskin gjort i månaden på ett maskinobjekt (queries.hamtaMaskinObjekt). */
export type TavlaMaskinObjekt = { maskin_id: string; roll: KlarRoll; objekt_id: string; namn: string | null; typ: string | null; bolag: string | null; egen_skotning: boolean; volym: number }
/** Det maskinen gjort i månaden som INTE räknas mot beställningen: privata jobb, GROT, objekt utan typ. */
export type TavlaUtanfor = { maskin_id: string; roll: KlarRoll; namn: string; volym: number }

/** Vad av maskinernas arbete som ligger utanför beställningen. Samma regel som spårens egna tal: objektets typ är ett spår, och
 *  finns en beställning för spåret räknas bara de beställda bolagen. Egen skotning räknas för skördaren, aldrig för en skotare. */
export function utanforBestallning(rader: TavlaMaskinObjekt[], spar: Pick<SparLage, 'typ' | 'bestallt' | 'bolag'>[]): TavlaUtanfor[] {
  return rader.flatMap(r => {
    const typ = (r.typ ?? '').toLowerCase()
    const sp = spar.find(s => s.typ === typ)
    const bolagOk = sp != null && (sp.bestallt <= 0 || sp.bolag.some(b => b.toLowerCase() === (r.bolag ?? '').toLowerCase()))
    const raknas = bolagOk && !(r.roll === 'skotare' && r.egen_skotning)
    const volym = Math.round(r.volym)
    if (raknas || volym <= 0) return []
    return [{ maskin_id: r.maskin_id, roll: r.roll, namn: kortNamn((r.namn ?? 'Okänt objekt').replace(/[.\s]+$/, '')), volym }]
  })
}

export type KoRad = {
  trakt: KlarTrakt
  /** Arbetsdagar trakten tar på maskinen; null = går inte att räkna. */
  dagar: number | null
  fran: string | null
  till: string | null
  /** 0–1: hur stor del av det som är kvar som hinns före månadens sista arbetsdag. */
  andelIManaden: number
  /** Volymen som är kvar för rollen. */
  kvar: number
  egen: boolean
}

/** Volymen som är kvar att göra för rollen: skotarens rest, eller skördarens volym minus det skördade. */
export function kvarVolym(t: KlarTrakt): number {
  if (t.roll === 'skotare') return Math.max(t.rest_volym ?? 0, 0)
  return Math.max((t.volym ?? 0) - t.utfort_volym, 0)
}

const klar6 = (x: number) => Math.round(x * 1e6) / 1e6

/** Maskinens kö i körordning, med hur mycket av varje trakt som hinns i månaden. Tolerant: en trakt utan prognos tar noll dagar. */
export function ko(m: KlarMaskin, trakter: KlarTrakt[], sistaArbetsdag: string, egna: ReadonlySet<string>): KoRad[] {
  const ordnade = trakter
    .filter(t => (m.manuell ? t.rest_volym == null || t.rest_volym > 0 : t.timmar == null || t.timmar > 0))
    .sort((a, b) => a.sortn - b.sortn)
  const dagarIManaden = m.dagar.filter(d => d <= sistaArbetsdag).length
  let summa = 0
  return ordnade.map(t => {
    const dg = dagarBehov(m, t)
    const foer = klar6(summa)
    summa += dg ?? 0
    const slut = klar6(summa)
    const andel = dg == null || dg <= 0 ? (foer < dagarIManaden ? 1 : 0) : Math.max(0, Math.min(1, (dagarIManaden - foer) / dg))
    return {
      trakt: t, dagar: dg,
      fran: dg == null ? null : (m.dagar[Math.floor(foer)] ?? null),
      till: dg == null ? null : (m.dagar[Math.max(Math.ceil(slut), 1) - 1] ?? null),
      andelIManaden: andel, kvar: kvarVolym(t), egen: egna.has(t.objekt_id),
    }
  })
}

// ── Vymodellen ──────────────────────────────────────────────────────────────
export type TavlaTrakt = {
  objekt_id: string
  roll: KlarRoll
  namn: string
  /** "19 nov" · "ca 19 nov" · "?" */
  klar: string
  /** Slutar efter månadens sista arbetsdag. */
  efter: boolean
  /** Räknas inte mot beställningen (annat spår, GROT, egen skotning) — dämpad. */
  utanfor: boolean
  /** "Vida sa 1 620 · ser ut att bli 1 240" — bara när den uppmätta volymen skiljer minst 5 % från Vidas. */
  volym?: string | null
}

export type TavlaMaskin = {
  maskin_id: string
  namn: string
  roll: KlarRoll
  nu: number
  /** null = månaden är avslutad (ingen prognos) eller underlaget saknas. */
  landar: number | null
  /** Landar bygger på ett förslag eller en trakt utan prognos. */
  ca: boolean
  /** "Står 26–30 okt" — bara när maskinen står. */
  stopp: string | null
  trakter: TavlaTrakt[]
  /** Det maskinen gjort i månaden utanför beställningen (störst först). null = inget, eller underlaget kunde inte läsas. */
  utanfor: { volym: number; trakter: { namn: string; volym: number }[] } | null
}

export type TavlaUtan = { objekt_id: string; roll: KlarRoll; namn: string; volym: number }

/** Takten som krävs för att nå beställningen mot takten maskinerna går på sina trakter (m³ per arbetsdag). */
export type TavlaTakt = {
  /** Beställt − gjort, delat med arbetsdagar kvar. */
  kravs: number
  /** Det maskinerna tillsammans hinner per dag på sina trakter i kön; null = ingen maskin har prognos. */
  nu: number | null
  dagarKvar: number
  /** Någon maskins takt saknas (en trakt utan prognos) — talet är ett minimum, "ca". */
  ca: boolean
  /** null = går inte att avgöra (takt saknas). */
  hinner: boolean | null
  /** Arbetsdagar som fattas om takten hålls; null om den hinner eller inte går att räkna. */
  fattasDagar: number | null
}

export type TavlaBlock = {
  roll: KlarRoll
  rubrik: 'Skördat' | 'Skotat'
  maskiner: TavlaMaskin[]
  /** Trakter i spåret som ingen maskin har för rollen. */
  utan: TavlaUtan[]
  /** Bara Skotat: det markägaren skotar själv (= det skördaren fällt där). null = ingen egen skotning i spåret. */
  markagare: { nu: number; landar: number | null; trakter: TavlaTrakt[] } | null
  nu: number
  landar: number | null
  ca: boolean
  ord: string
  ton: Ton
  /** Landar − beställt (negativt = fattas). null utan beställning eller prognos. */
  diff: number | null
  /** Takten som krävs. null = månaden är inte pågående, ingen beställning, inget kvar att göra eller inga arbetsdagar kvar. */
  takt: TavlaTakt | null
}

/** Räcker trakterna? Skogen som finns kvar att ta (gjort + kvar i inlagda trakter) mot beställningen, per roll. */
export type TavlaBehovRad = {
  objekt_id: string
  namn: string
  /** Volymen som är kvar att ta för rollen. */
  kvar: number
  /** Hur mycket av trakten som behövs för beställningen (≤ kvar). */
  behovs: number
  /** Maskinen som har trakten, null = ingen. */
  maskin: string | null
  /** Ordningen går inte att ändra: förra månadens trakt. */
  fast: boolean
  /** Arbetsdagar maskinen behöver för det som behövs (behovs-raden) eller för hela resten (inte-raden); null = prognos saknas, aldrig 0. */
  dagar: number | null
  /** "ca 2 dec" när klardatumet går att räkna, annars null. */
  till: string | null
}

/** Vilka trakter som behövs för att nå beställningen, i körordning, och vilka som kan vänta. Bara skördaren (trakten flyttas som helhet). */
export type TavlaBehov = {
  bestallt: number
  nu: number
  /** Beställt − gjort (aldrig under 0). */
  behov: number
  /** Det som saknas även om alla trakter körs. 0 = skogen räcker. */
  saknas: number
  behovs: TavlaBehovRad[]
  /** Summa arbetsdagar för "behövs"-trakterna; null när någon saknar prognos (summan vore för snäll). */
  dagarBehovs: number | null
  /** Behövs inte i månaden. `flyttbar` = trakten kan flyttas: inte förra månadens och inte påbörjad. */
  inte: (TavlaBehovRad & { flyttbar: boolean })[]
}

/** Skotarens trakter i spåret, i körordning: vad som är kvar, vem som tar den och hur lång tid. Bara läsning — skördaren avgör vad som flyttas. */
export type TavlaSkot = {
  bestallt: number
  nu: number
  /** Beställt − skotat (aldrig under 0). */
  behov: number
  /** Det som saknas även om ALLA trakter med skotare skotas. 0 = trakterna med skotare räcker. */
  saknas: number
  /** Kvar i trakter som saknar skotare — skotas inte om ingen väljs. */
  utanSumma: number
  /** `behovs` = hur mycket av trakten som behöver skotas för beställningen (≤ kvar); 0 = behövs inte i månaden. */
  rader: { objekt_id: string; namn: string; kvar: number; behovs: number; fast: boolean; maskin: string | null; dagar: number | null; till: string | null }[]
}

export type TavlaRacker = {
  roll: KlarRoll
  rubrik: 'Skördare' | 'Skotare'
  /** gjort + kvar − beställt (negativt = trakterna räcker inte). Enheten är m³ och står i rubriken. */
  diff: number
  /** "Räcker" · "Saknar 378 m³" · "1 479 m³ för mycket" */
  ord: string
  ton: Ton
  /** Vilka trakter som behövs. Bara för skördaren. */
  behov: TavlaBehov | null
  /** Skotarens trakter. Bara för skotaren. */
  skot: TavlaSkot | null
}

/** Något planeraren kan göra något åt. */
export type TavlaGor =
  | { slag: 'saknas'; text: string; under: string }
  | { slag: 'utan'; roll: KlarRoll; text: string; under: string; trakter: TavlaUtan[] }
  | { slag: 'formycket'; text: string; under: string }

/** Mer än så här över beställt är för mycket inlagt för månaden. */
export const FOR_MYCKET = 0.2

export type TavlaSpar = {
  typ: Typ
  namn: string
  bestallt: number
  block: [TavlaBlock, TavlaBlock]
  /** Tom i en avslutad månad, utan beställning eller när köerna inte gick att läsa. */
  racker: TavlaRacker[]
  /** Ingående oskotat + skördat − skotat. */
  kvarISkogen: number
}

export type TavlaOvrig = { maskin_id: string; namn: string; roll: KlarRoll; trakter: TavlaTrakt[] }

export type Tavla = {
  svar: { rubrik: string; avvikelse: boolean }
  /** "Vad kan du göra?" — bara det som finns. */
  gor: TavlaGor[]
  spar: TavlaSpar[]
  /** Maskiner vars kö bara har sådant som inte räknas mot beställningen (GROT, energiklippning, egen skotning). */
  ovrigt: TavlaOvrig[]
}

export type TavlaIndata = {
  status: ManadStatus
  spar: SparLage[]
  /** Maskinernas volym i månaden per spår. null = kunde inte läsas: blocken visar då spårets summa utan maskinrader. */
  utfall: TavlaUtfall[] | null
  /** Underlaget för köerna (med förslag och följande prognos). null = avslutad månad eller kunde inte läsas. */
  klar: KlarData | null
  /** Trakter där markägaren skotar själv. */
  egna: ReadonlySet<string>
  /** Skördat i månaden på egen skotning, redan filtrerat till spårets beställning. */
  egetSkordat?: TavlaEgetSkordat[]
  /** Det maskinerna gjort utanför beställningen (utanforBestallning). Utelämnat = inte läst: ingen rad, aldrig "0". */
  utanfor?: TavlaUtanfor[]
  /** Stopptext per maskin. */
  stopp?: Record<string, string | null>
  flytt?: Flytt
  /** Förhandsvisning: trakterna i NY ordning (objekt_id). De tar över varandras platser i körordningen; övriga rörs inte. */
  ordning?: string[]
}

/** Raden under trakten: Vidas volym mot den som räknats på det skördaren gjort. Tyst när de är nära varandra. */
export function vidaMotMatt(m: KlarTrakt['matt']): string | null {
  if (!m || m.vida == null || m.vida <= 0) return null
  if (Math.abs(m.total / m.vida - 1) < MATT_VISA_FRAN) return null
  return `Vida sa ${fmt(m.vida)} · ${m.klar ? 'blev' : 'ser ut att bli'} ${fmt(m.total)}`
}

function traktNamn(t: KlarTrakt): string {
  return `${arVirke(t.typ) ? '' : `${KLAR_TYP_NAMN[t.typ]} `}${kortNamn(t.namn.replace(/[.\s]+$/, ''))}`
}

function traktVy(r: KoRad, typ: Typ | null, sista: string): TavlaTrakt {
  const osaker = r.trakt.uppskattad === true && !r.trakt.foljer
  return {
    objekt_id: r.trakt.objekt_id, roll: r.trakt.roll, namn: traktNamn(r.trakt),
    klar: r.till == null ? '?' : `${osaker ? 'ca ' : ''}${fmtDag(r.till)}`,
    efter: r.till != null && r.till > sista,
    utanfor: typ == null || r.trakt.typ !== typ,
    volym: vidaMotMatt(r.trakt.matt),
  }
}

function dom(roll: KlarRoll, landar: number | null, nu: number, bestallt: number, ca: boolean, status: ManadStatus): Pick<TavlaBlock, 'ord' | 'ton' | 'diff'> {
  if (bestallt <= 0) return { ord: 'Ingen beställning', ton: 'dampad', diff: null }
  const tal = landar ?? nu
  const diff = tal - bestallt
  const c = ca && landar != null ? 'ca ' : ''
  if (nu >= bestallt && diff <= bestallt * OVER_GRANS) return { ord: 'Klar', ton: 'gron', diff }
  if (diff < 0) {
    if (status === 'avslutad') return { ord: `Fattades ${fmt(-diff)}`, ton: 'orange', diff }
    return { ord: `Fattas ${c}${fmt(-diff)}`, ton: 'orange', diff }
  }
  // Över beställt är bara skördarens sak ("vi får inte producera hur mycket som helst"); skotaren som hinner mer än beställt hinner.
  if (roll === 'skordare' && diff > bestallt * OVER_GRANS) return { ord: `${c}${fmt(diff)} över`, ton: 'orange', diff }
  return { ord: status === 'avslutad' ? 'Klar' : 'Hinner', ton: 'gron', diff }
}

/** Byt plats på rad k och dess granne (-1 upp, +1 ned) i en lista; returnerar den nya listan. */
export function flyttaPlats(ids: string[], k: number, riktning: -1 | 1): string[] {
  const m = k + riktning
  if (k < 0 || m < 0 || m >= ids.length) return ids
  const n = [...ids]
  ;[n[k], n[m]] = [n[m], n[k]]
  return n
}

/** Lägg trakterna i en ny ordning: de som nämns tar över varandras sortn-platser (sorterade), allt annat står kvar. Samma objekt har samma plats i båda rollerna. */
export function medOrdning(trakter: KlarTrakt[], ordning: string[] | undefined): KlarTrakt[] {
  if (!ordning || ordning.length < 2) return trakter
  const nya = new Set(ordning)
  const platser = [...new Set(trakter.filter(t => nya.has(t.objekt_id)).map(t => t.sortn))].sort((a, b) => a - b)
  const nyPlats = new Map<string, number>()
  ordning.forEach((id, i) => { if (platser[i] != null) nyPlats.set(id, platser[i]) })
  return trakter.map(t => (nyPlats.has(t.objekt_id) ? { ...t, sortn: nyPlats.get(t.objekt_id)! } : t))
}

/** Hela körordningen (objekt_id, första först) efter en förhandsvisad ordning — det som skrivs till objekt.ordning när du sparar. */
export function slutordning(trakter: KlarTrakt[], ordning: string[] | undefined): string[] {
  const ny = medOrdning(trakter, ordning)
  const plats = new Map<string, number>()
  for (const t of ny) if (!plats.has(t.objekt_id)) plats.set(t.objekt_id, t.sortn)
  return [...plats.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)
}

export function byggTavla(d: TavlaIndata): Tavla {
  const klar = d.klar
  const trakter = klar
    ? (d.flytt ? medOrdning(klar.trakter, d.ordning).map(t => (t.objekt_id === d.flytt!.objekt_id && t.roll === d.flytt!.roll ? { ...t, maskin_id: d.flytt!.maskin_id } : t)) : medOrdning(klar.trakter, d.ordning))
        // Egen skotning: skotarrollen finns inte hos oss.
        .filter(t => !(t.roll === 'skotare' && d.egna.has(t.objekt_id)))
    : []
  const sista = klar?.sista_arbetsdag ?? ''
  const koer = new Map<string, KoRad[]>()
  for (const m of klar?.maskiner ?? []) koer.set(m.maskin_id, ko(m, trakter.filter(t => t.maskin_id === m.maskin_id), sista, d.egna))
  const kanda = new Set((klar?.maskiner ?? []).map(m => m.maskin_id))
  const iNagotSpar = new Set<string>()
  // Utanför beställningen står EN gång per maskin: i det första spåret hon syns i.
  const utanforVisad = new Set<string>()
  const utanforFor = (id: string, roll: KlarRoll): TavlaMaskin['utanfor'] => {
    const k = `${roll}:${id}`
    if (utanforVisad.has(k)) return null
    utanforVisad.add(k)
    const rader = (d.utanfor ?? []).filter(u => u.maskin_id === id && u.roll === roll).sort((a, b) => b.volym - a.volym)
    return rader.length === 0 ? null : { volym: rader.reduce((a, u) => a + u.volym, 0), trakter: rader.map(u => ({ namn: u.namn, volym: u.volym })) }
  }

  // Slutavverkning först: den stora beställningen.
  const spar: TavlaSpar[] = [...d.spar].sort((a, b) => Number(b.typ === 'slutavverkning') - Number(a.typ === 'slutavverkning')).map(s => {
    const block = (['skordare', 'skotare'] as const).map((roll): TavlaBlock => {
      // Skördaren får med det hon fällt på egen skotning; spårets egna tal (SQL) räknar inte med de trakterna.
      const egetPer = new Map<string, number>()
      if (roll === 'skordare') for (const e of d.egetSkordat ?? []) if (e.typ === s.typ) egetPer.set(e.maskin_id, (egetPer.get(e.maskin_id) ?? 0) + e.volym)
      const bas = (d.utfall ?? []).filter(u => u.typ === s.typ && u.roll === roll)
      const utfall = [...new Set([...bas.map(u => u.maskin_id), ...egetPer.keys()])]
        .map(id => ({ maskin_id: id, volym: (bas.find(u => u.maskin_id === id)?.volym ?? 0) + (egetPer.get(id) ?? 0) }))
        .filter(u => u.volym > 0)
      // Egen skotning räknas för skördaren, aldrig för våra skotare.
      const raknas = (r: KoRad) => r.trakt.typ === s.typ && (roll === 'skordare' || !r.egen)
      const ids: string[] = []
      for (const m of klar?.maskiner ?? []) {
        if (m.roll !== roll) continue
        const harKo = (koer.get(m.maskin_id) ?? []).some(raknas)
        if (harKo || utfall.some(u => u.maskin_id === m.maskin_id)) ids.push(m.maskin_id)
      }
      for (const u of utfall) if (!ids.includes(u.maskin_id)) ids.push(u.maskin_id)
      const maskiner = ids.map((id): TavlaMaskin => {
        iNagotSpar.add(id)
        const m = klar?.maskiner.find(x => x.maskin_id === id) ?? null
        const rader = koer.get(id) ?? []
        const nu = Math.round(utfall.find(u => u.maskin_id === id)?.volym ?? 0)
        const egnaRader = rader.filter(raknas)
        const tillkommer = egnaRader.reduce((sum, r) => sum + r.kvar * r.andelIManaden, 0)
        // Osäkert: en trakt före eller i spårets del av kön saknar prognos, eller bygger på ett förslag.
        const ca = rader.some(r => r.dagar == null) || egnaRader.some(r => r.trakt.uppskattad === true && !r.trakt.foljer)
        return {
          maskin_id: id, namn: m?.namn ?? id, roll, nu,
          landar: klar ? Math.round(nu + tillkommer) : null, ca: klar ? ca : false,
          stopp: d.stopp?.[id] ?? null,
          trakter: rader.map(r => traktVy(r, s.typ, sista)),
          utanfor: utanforFor(id, roll),
        }
      })
      const utan: TavlaUtan[] = trakter
        .filter(t => t.typ === s.typ && t.roll === roll && (t.maskin_id == null || !kanda.has(t.maskin_id)) && !d.egna.has(t.objekt_id))
        .sort((a, b) => a.sortn - b.sortn)
        .map(t => ({ objekt_id: t.objekt_id, roll, namn: traktNamn(t), volym: Math.round(kvarVolym(t)) }))
      const harRader = d.utfall != null
      const egetSumma = Math.round((d.egetSkordat ?? []).filter(e => e.typ === s.typ).reduce((a, e) => a + e.volym, 0))
      // Markägarens rad: det skördaren fällt på egen skotning, plus det hon hinner fälla där före månadens slut.
      let markagare: TavlaBlock['markagare'] = null
      if (roll === 'skotare') {
        const egnaKo = [...koer.values()].flat().filter(r => r.trakt.roll === 'skordare' && r.trakt.typ === s.typ && r.egen)
        const egnaTrakter = (klar?.trakter ?? []).filter(t => t.roll === 'skotare' && t.typ === s.typ && d.egna.has(t.objekt_id)).sort((a, b) => a.sortn - b.sortn)
        if (egetSumma > 0 || egnaKo.length > 0 || egnaTrakter.length > 0) {
          markagare = {
            nu: egetSumma,
            landar: klar && d.status !== 'avslutad' ? Math.round(egetSumma + egnaKo.reduce((a, r) => a + r.kvar * r.andelIManaden, 0)) : null,
            trakter: egnaTrakter.map(t => ({ objekt_id: t.objekt_id, roll: 'skotare' as const, namn: traktNamn(t), klar: '', efter: false, utanfor: false })),
          }
        }
      }
      const nu = (harRader ? maskiner.reduce((a, m) => a + m.nu, 0) : Math.round(roll === 'skordare' ? s.skordat + egetSumma : s.skotat)) + (markagare?.nu ?? 0)
      const landar = klar && d.status !== 'avslutad' ? (harRader ? maskiner.reduce((a, m) => a + (m.landar ?? m.nu), 0) + (markagare ? (markagare.landar ?? markagare.nu) : 0) : null) : null
      const ca = maskiner.some(m => m.ca)
      const takt = taktKrav(s.bestallt, nu, d.status, klar, roll, ids.map(id => (koer.get(id) ?? []).filter(raknas)))
      return { roll, rubrik: roll === 'skordare' ? 'Skördat' : 'Skotat', maskiner, utan, markagare, nu, landar, ca, takt, ...dom(roll, landar, nu, s.bestallt, ca, d.status) }
    }) as [TavlaBlock, TavlaBlock]
    return { typ: s.typ, namn: TYP_NAMN[s.typ], bestallt: s.bestallt, block, racker: racker(s.typ, s.bestallt, block, trakter, d.status, klar != null, new Map([...koer.values()].flat().filter(r => r.trakt.roll === 'skordare').map(r => [r.trakt.objekt_id, r])), new Map([...koer.values()].flat().filter(r => r.trakt.roll === 'skotare').map(r => [r.trakt.objekt_id, r])), new Map((klar?.maskiner ?? []).map(m => [m.maskin_id, m.namn]))), kvarISkogen: Math.round(oskotatKvar(s)) }
  })

  const ovrigt: TavlaOvrig[] = (klar?.maskiner ?? [])
    .filter(m => !iNagotSpar.has(m.maskin_id) && (koer.get(m.maskin_id) ?? []).length > 0)
    .map(m => ({ maskin_id: m.maskin_id, namn: m.namn, roll: m.roll, trakter: (koer.get(m.maskin_id) ?? []).map(r => ({ ...traktVy(r, null, sista), utanfor: false })) }))

  return { svar: tavlaSvar(spar, d.status), gor: tavlaGor(spar), spar, ovrigt }
}

/** Takten som krävs mot takten som går. Takten som går = per maskin kvar volym / dagar för trakterna i kön (samma dagar som klardatumen), summerad över maskinerna som kör parallellt. */
function taktKrav(bestallt: number, nu: number, status: ManadStatus, klar: KlarData | null, roll: KlarRoll, perMaskin: KoRad[][]): TavlaTakt | null {
  if (!klar || status !== 'pagaende' || bestallt <= 0) return null
  const behov = Math.max(0, bestallt - nu)
  const dagarKvar = Math.max(0, ...klar.maskiner.filter(m => m.roll === roll).map(m => m.dagar.filter(x => x <= klar.sista_arbetsdag).length))
  if (behov <= 0 || dagarKvar <= 0) return null
  let tot = 0, harNagon = false, ca = false
  for (const rader of perMaskin) {
    if (rader.length === 0) continue
    const med = rader.filter(r => r.dagar != null && r.dagar > 0)
    if (med.length < rader.length) ca = true
    const dagar = med.reduce((a, r) => a + (r.dagar as number), 0)
    if (dagar > 0) { tot += med.reduce((a, r) => a + r.kvar, 0) / dagar; harNagon = true }
  }
  const kravs = behov / dagarKvar
  if (!harNagon || !(tot > 0)) return { kravs, nu: null, dagarKvar, ca: true, hinner: null, fattasDagar: null }
  const hinner = tot >= kravs
  return { kravs, nu: tot, dagarKvar, ca, hinner, fattasDagar: hinner ? null : behov / tot - dagarKvar }
}

/** Räcker trakterna: det som är gjort + det som är kvar i inlagda trakter, mot beställt. Skotaren räknar inte egen skotning (den är inte vår). */
function racker(typ: Typ, bestallt: number, block: TavlaBlock[], trakter: KlarTrakt[], status: ManadStatus, harKo: boolean, koPerTrakt: Map<string, KoRad>, skotKo: Map<string, KoRad>, maskinNamn: Map<string, string>): TavlaRacker[] {
  if (bestallt <= 0 || status === 'avslutad' || !harKo) return []
  return block.map((b): TavlaRacker => {
    const lista = trakter.filter(t => t.typ === typ && t.roll === b.roll)
    const kvar = lista.reduce((a, t) => a + kvarVolym(t), 0)
    const diff = Math.round(b.nu + kvar - bestallt)
    const rubrik = b.roll === 'skordare' ? 'Skördare' : 'Skotare'
    const behov = b.roll === 'skordare' ? behovLista(lista, bestallt, b.nu, koPerTrakt, maskinNamn) : null
    const skot = b.roll === 'skotare' ? skotLista(lista, bestallt, b.nu, skotKo, maskinNamn) : null
    if (diff < 0) return { roll: b.roll, rubrik, diff, ord: `Saknar ${fmt(-diff)}`, ton: 'orange', behov, skot }
    if (diff > bestallt * FOR_MYCKET) return { roll: b.roll, rubrik, diff, ord: `${fmt(diff)} för mycket`, ton: 'dampad', behov, skot }
    return { roll: b.roll, rubrik, diff, ord: 'Räcker', ton: 'gron', behov, skot }
  })
}

function skotLista(lista: KlarTrakt[], bestallt: number, nu: number, skotKo: Map<string, KoRad>, maskinNamn: Map<string, string>): TavlaSkot {
  const behov = Math.max(0, Math.round(bestallt - nu))
  const rader: TavlaSkot['rader'] = []
  // Bara trakter MED skotare räknas som skotade: en trakt utan maskin körs inte av sig själv.
  let summaMed = 0
  let utanSumma = 0
  for (const t of [...lista].sort((a, b) => a.sortn - b.sortn)) {
    const kvar = Math.round(kvarVolym(t))
    if (kvar <= 0) continue
    const maskin = t.maskin_id ? (maskinNamn.get(t.maskin_id) ?? null) : null
    let behovs = 0
    if (maskin != null) { behovs = summaMed >= behov ? 0 : Math.min(kvar, behov - summaMed); summaMed += kvar } else utanSumma += kvar
    const r = skotKo.get(t.objekt_id)
    const osaker = t.uppskattad === true && !t.foljer
    rader.push({ objekt_id: t.objekt_id, namn: traktNamn(t), kvar, behovs, fast: t.forra_manaden, maskin, dagar: r?.dagar ?? null, till: r?.till ? `${osaker ? 'ca ' : ''}${fmtDag(r.till)}` : null })
  }
  return { bestallt, nu: Math.round(nu), behov, saknas: Math.max(0, Math.round(behov - summaMed)), utanSumma, rader }
}

/** Trakterna i körordning: de första som tillsammans täcker behovet behövs, resten kan vänta. */
function behovLista(lista: KlarTrakt[], bestallt: number, nu: number, koPerTrakt: Map<string, KoRad>, maskinNamn: Map<string, string>): TavlaBehov {
  const behov = Math.max(0, Math.round(bestallt - nu))
  let summa = 0
  const behovs: TavlaBehovRad[] = []
  const inte: TavlaBehov['inte'] = []
  // Tiden: maskinens egna dagar för trakten (samma som kön), delad efter hur stor del som behövs. Saknas prognos är den null, aldrig 0.
  const namnPa = (t: KlarTrakt) => (t.maskin_id ? (maskinNamn.get(t.maskin_id) ?? null) : null)
  const tid = (t: KlarTrakt, del: number): Pick<TavlaBehovRad, 'dagar' | 'till'> => {
    const r = koPerTrakt.get(t.objekt_id)
    if (!r || r.dagar == null) return { dagar: null, till: null }
    const osaker = t.uppskattad === true && !t.foljer
    return { dagar: r.dagar * del, till: r.till == null ? null : `${osaker ? 'ca ' : ''}${fmtDag(r.till)}` }
  }
  for (const t of [...lista].sort((a, b) => a.sortn - b.sortn)) {
    const kvar = Math.round(kvarVolym(t))
    if (kvar <= 0) continue
    if (summa >= behov) inte.push({ objekt_id: t.objekt_id, namn: traktNamn(t), kvar, behovs: 0, maskin: namnPa(t), fast: t.forra_manaden, ...tid(t, 1), flyttbar: !t.forra_manaden && t.utfort_volym <= 0 })
    else { const b = Math.min(kvar, Math.round(behov - summa)); behovs.push({ objekt_id: t.objekt_id, namn: traktNamn(t), kvar, behovs: b, maskin: namnPa(t), fast: t.forra_manaden, ...tid(t, b / kvar) }) }
    summa += kvar
  }
  const dagarBehovs = behovs.length > 0 && behovs.every(b => b.dagar != null) ? behovs.reduce((a, b) => a + (b.dagar as number), 0) : null
  return { bestallt, nu: Math.round(nu), behov, saknas: Math.max(0, Math.round(behov - summa)), behovs, dagarBehovs, inte }
}

/** "ca 9 arbetsdagar" · "ca 1 dag" · "under en dag". Alltid "ca": det är en prognos. */
export function dagarText(d: number): string {
  if (d < 0.5) return 'under en halv dag'
  if (d < 1.5) return 'ca 1 arbetsdag'
  return `ca ${Math.round(d)} arbetsdagar`
}

/** Det du kan göra: ny trakt när skogen tar slut, välj maskin åt trakter utan, flytta till nästa månad när för mycket är inlagt. Saknas först. */
function tavlaGor(spar: TavlaSpar[]): TavlaGor[] {
  const saknas: TavlaGor[] = []
  const utan: TavlaGor[] = []
  const formycket: TavlaGor[] = []
  for (const s of spar) {
    // EN rad per spår när skogen tar slut, med skördare och skotare på samma rad.
    const brist = s.racker.filter(r => r.ton === 'orange')
    if (brist.length > 0) saknas.push({ slag: 'saknas', text: `Lägg in en ny trakt i ${s.namn.toLowerCase()}`, under: brist.map((r, i) => `${i === 0 ? r.rubrik : r.rubrik.toLowerCase()} saknar ${fmt(-r.diff)} m³`).join(' · ') })
    for (const r of s.racker) {
      if (r.ton === 'dampad' && r.roll === 'skordare') formycket.push({ slag: 'formycket', text: `${s.namn} har för mycket inlagt`, under: `Ca ${fmt(r.diff)} m³ över beställt · flytta en trakt till nästa månad` })
    }
    for (const b of s.block) {
      if (b.utan.length === 0) continue
      const antal = b.utan.length
      const vol = b.utan.reduce((a, u) => a + Math.round(u.volym), 0)
      const vem = b.roll === 'skordare' ? 'skördare' : 'skotare'
      utan.push({ slag: 'utan', roll: b.roll, text: antal === 1 ? `1 trakt har ingen ${vem}` : `${antal} trakter har ingen ${vem}`, under: `${s.namn} · ${fmt(vol)} m³ · välj maskin`, trakter: b.utan })
    }
  }
  return [...saknas, ...utan, ...formycket]
}

/** EN mening: det som fattas (skotat = det som levereras), annars skördaren över, annars att vi hinner. */
export function tavlaSvar(spar: TavlaSpar[], status: ManadStatus): Tavla['svar'] {
  const med = spar.filter(s => s.bestallt > 0)
  if (med.length === 0) return { rubrik: 'Ingen beställning inlagd', avvikelse: false }
  const fattas = med.filter(s => (s.block[1].diff ?? 0) < 0 && s.block[1].ton === 'orange')
  if (fattas.length > 0) {
    const delar = fattas.map((s, i) => {
      const b = s.block[1]
      const tal = `${b.ca && b.landar != null ? 'ca ' : ''}${fmt(-(b.diff as number))}`
      return i === 0 ? `${s.namn} ${status === 'avslutad' ? 'fattades' : 'fattas'} ${tal}` : `${s.namn.toLowerCase()} ${tal}`
    })
    return { rubrik: delar.join(' · '), avvikelse: true }
  }
  if (status === 'avslutad') return { rubrik: 'Beställningen blev klar', avvikelse: false }
  const over = med.filter(s => s.block[0].ton === 'orange' && (s.block[0].diff ?? 0) > 0)
  if (over.length > 0) return { rubrik: `Skördaren går ${fmt(over[0].block[0].diff as number)} över på ${over[0].namn.toLowerCase()}`, avvikelse: true }
  if (status === 'kommande') return { rubrik: 'Vi hinner med beställningen', avvikelse: false }
  if (med.every(s => s.block[1].ord === 'Klar')) return { rubrik: 'Beställningen är klar', avvikelse: false }
  return { rubrik: 'Vi hinner med beställningen', avvikelse: false }
}

// ── Flytta en trakt ─────────────────────────────────────────────────────────
export type FlyttVal = {
  maskin_id: string
  namn: string
  nuvarande: boolean
  /** Vad som gäller OM maskinen tar trakten: spårets dom för rollen ("Hinner", "Fattas ca 800") eller, utanför beställningen, klar-datumet. */
  ord: string
  ton: Ton
}

/** Maskinerna som kan ta trakten, och vad varje val ger. Den som har trakten nu står först. */
export function flyttVal(d: TavlaIndata, objektId: string, roll: KlarRoll): { namn: string; val: FlyttVal[] } | null {
  const klar = d.klar
  const t = klar?.trakter.find(x => x.objekt_id === objektId && x.roll === roll)
  if (!klar || !t) return null
  const arEgen = roll === 'skotare' && d.egna.has(objektId)
  const utan = new Set([...d.egna].filter(x => x !== objektId))
  const val = klar.maskiner
    .filter(m => m.roll === roll && kanValjas(m, t))
    .map((m): FlyttVal => {
      const tavla = byggTavla({ ...d, egna: utan, flytt: { objekt_id: objektId, roll, maskin_id: m.maskin_id } })
      const sp = arVirke(t.typ) ? tavla.spar.find(s => s.typ === t.typ) : null
      const b = sp ? sp.block[roll === 'skordare' ? 0 : 1] : null
      if (b && sp && sp.bestallt > 0) return { maskin_id: m.maskin_id, namn: m.namn, nuvarande: !arEgen && t.maskin_id === m.maskin_id, ord: b.ord, ton: b.ton }
      const rad = [...tavla.spar.flatMap(s => s.block.flatMap(x => x.maskiner)), ...tavla.ovrigt].find(x => x.maskin_id === m.maskin_id)?.trakter.find(x => x.objekt_id === objektId)
      return { maskin_id: m.maskin_id, namn: m.namn, nuvarande: !arEgen && t.maskin_id === m.maskin_id, ord: rad ? `Klar ${rad.klar}` : '–', ton: rad?.efter ? 'orange' : 'dampad' }
    })
  // Skotningen kan också vara markägarens egen (bara virke: slutavverkning och gallring).
  if (roll === 'skotare' && arVirke(t.typ)) {
    const b = byggTavla({ ...d, egna: new Set([...d.egna, objektId]) }).spar.find(s => s.typ === t.typ)?.block[1]
    val.push({ maskin_id: EGEN_SKOTNING, namn: 'Egen skotning', nuvarande: arEgen, ord: b && b.diff != null ? b.ord : 'Markägaren skotar', ton: b && b.diff != null ? b.ton : 'dampad' })
  }
  val.sort((a, b) => Number(b.nuvarande) - Number(a.nuvarande))
  return { namn: traktNamn(t), val }
}
