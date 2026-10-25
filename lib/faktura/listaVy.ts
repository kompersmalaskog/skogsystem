// Faktureringsvyns LISTA — all text, alla tal och all gruppering på ETT ställe.
// Sidan ritar bara (samma mönster som lib/markagarrapport/vy.ts och
// lib/redigering/behoverDig.ts).
//
// Formen är husets: frågan som rubrik, svaret först, ord före tal.
//
// VARFÖR DET MANUELLA HAR EGNA GRUPPER (utredning mot prod 2026-10-24):
// faktura_oversikt().tillstand speglar MASKINERNAS avslut. Debiterbart arbete
// ur arbetsrapporten följer inte maskinen — Skälviken hade 16,47 timmar och
// låg som "inte påbörjad" eftersom ingen maskin rapporterat, Arvidstorp 8,88
// timmar utan någon maskinrad alls. Av 47,72 debiterbara timmar satt 30 i en
// dämpad hög eller utanför vyn. Därför:
//   * en trakt med debiterbart arbete som INTE är klar hamnar i en egen grupp
//     som syns, aldrig i "Vad väntar?";
//   * handinknappade skotartimmar (810E kan inte skicka filer) blir en rad i
//     "Vad ska du göra?" — de finns i datan men radbyggaren prissätter ur
//     fakt_tid, så de är inte med i priset än.
// Talen summeras aldrig över högarna: en trakt räknas EN gång, i en grupp.
//
// VARFÖR HÖGARNA FÖLJER FAKTURAN OCH INTE MASKINERNA (2026-10-25):
// tillstand='klar' betyder att maskinerna är klara, inte att något återstår att
// fakturera. Av de 23 "klara" i prod var 20 redan fakturerade och fem
// slutredovisade — talet överst var alltså fel, och det som faktiskt återstod
// (två trakter) låg begravt i en hög på 23. Högarna läser därför VÅRA skickade
// fakturor (lib/faktura/fakturaLage.ts): Att fakturera · Går inte att se ·
// Fakturerat · Slutredovisat. En trakt vi hunnit fakturera visas i sin
// fakturahög även om maskinerna står som pågående — fakturan är skickad, vad
// maskinavslutet än säger. "Vad ska du göra?" rörs inte: saknar trakten något
// saknar den det fortfarande.

import {
  type FakturaLage, type TraktFaktura, type Lage,
  lageFor, senasteFakturan, slutredovisningen,
} from './fakturaLage'

export type OversiktsRad = {
  vo_nummer: string
  namn: string | null
  bolag: string | null
  fortnox_kundnr: number | null
  avtalsform: 'ackord' | 'timpeng'
  tillstand: 'klar' | 'atgard' | 'ingen_gemensam_kund' | 'pagar' | 'ej_paborjad'
  avrakningsdatum: string | null
  objekt_antal: number
  volym_m3fub: number
  g15h: number
  hinder: string | null
  hinder_typ: 'kund' | 'traillertimmar' | 'kontraktsnr' | null
  saknar_objektrad: boolean
  har_maskindata: boolean
  debiterbart_arbete_tim: number
  debiterbart_arbete_poster: number
  manuell_skotartid_tim: number
}

/** Debiterbart arbete i arbetsrapporten som inte har någon trakt alls. */
export type ArbeteUtanTrakt = { poster: number; timmar: number }

export type TraktRad = {
  vo: string
  titel: string
  under: string
  /** Talet till höger: det som faktureras på. */
  hoger: string
  hogerUnder: string
  /** Orange = något saknas och raden säger vad. */
  varning: boolean
}

export type AttGoraRad = {
  nyckel: 'kontraktsnr' | 'traillertimmar' | 'kund' | 'skotartimmar' | 'arbete_utan_trakt'
  titel: string
  under: string
  /** Vart raden leder, när den leder till EN trakt. */
  vo?: string
}

export type ManadsGrupp = { rubrik: string; rader: TraktRad[] }

/** En hög i faktureringens ordning. En tom hög finns inte. */
export type Hog = {
  nyckel: 'att_fakturera' | 'okant_lage' | 'fakturerat' | 'klart' | 'klara'
  /** Frågan den svarar på. */
  rubrik: string
  /** En rad som säger vad högen är — EN gång, inte på varje rad. */
  under: string | null
  /** Orange prick på den raden: något i högen kräver dig. EN prick, inte en per rad. */
  varning: boolean
  grupper: ManadsGrupp[]
}

/** En trakt i genomgången av kontraktsnummer — en i taget, i ordning. */
export type KontraktsPost = {
  vo: string
  namn: string
  under: string
  /** Trakten finns inte upplagd: den skapas när numret sparas. */
  saknarTrakt: boolean
}

export type ListVy = {
  svar: { tal: string; text: string; under: string | null }
  attGora: AttGoraRad[]
  /** Faktureringens högar, i ordning. Tomma högar finns inte. */
  hogar: Hog[]
  /** Debiterbart arbete på trakter som inte går att fakturera än. */
  arbeteVantar: TraktRad[]
  vantar: { titel: string; under: string } | null
  /** Kön till genomgången: störst volym först, så det tyngsta blir gjort. */
  kontraktsKo: KontraktsPost[]
  fot: string
}

const MANADER = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
]
const MANADER_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

const nr = (n: number, dec = 0) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: dec })

/** "Oktober 2026" ur ett ISO-datum. Utan datum: en egen hög sist, med sitt skäl. */
export function manadsRubrik(iso: string | null, utan = 'Utan avräkningsdatum'): string {
  if (!iso) return utan
  const [ar, man] = iso.split('-')
  const namn = MANADER[Number(man) - 1]
  if (!namn) return utan
  return `${namn[0].toUpperCase()}${namn.slice(1)} ${ar}`
}

/** "19 okt" — fakturadatum på en rad. Utan datum: null, aldrig ett påhittat. */
export function kortDatum(iso: string | null): string | null {
  if (!iso) return null
  const [, man, dag] = iso.split('-')
  const namn = MANADER_KORT[Number(man) - 1]
  if (!namn || !dag) return null
  return `${Number(dag)} ${namn}`
}

function traktRad(r: OversiktsRad, varning = false): TraktRad {
  // BÅDA talen visas när båda finns: ett timpengsobjekt har ändå en volym och
  // tvärtom, och att välja åt Martin döljer hälften. Det som FAKTURERAS står
  // till höger, det andra i raden under.
  const timpeng = r.avtalsform === 'timpeng'
  const hoger = timpeng ? nr(r.g15h, 1) : nr(r.volym_m3fub)
  const hogerUnder = timpeng ? 'tim' : 'm³fub'
  const andra = timpeng
    ? (r.volym_m3fub > 0 ? ` · ${nr(r.volym_m3fub)} m³fub` : '')
    : (r.g15h > 0 ? ` · ${nr(r.g15h, 1)} tim` : '')
  return {
    vo: r.vo_nummer,
    titel: r.namn ?? `VO ${r.vo_nummer}`,
    under: `${r.bolag ?? 'bolag saknas'} · ${r.avtalsform}${andra}`,
    hoger,
    hogerUnder,
    varning,
  }
}

export function byggListVy(
  rader: OversiktsRad[],
  utanTrakt: ArbeteUtanTrakt | null,
  /** null = fakturorna kunde inte läsas. Då faller listan tillbaka på EN hög, och säger varför. */
  faktura: FakturaLage | null,
): ListVy {
  const klaraRader = rader.filter(r => r.tillstand === 'klar')
  const lagetFor = (vo: string): Lage => lageFor(faktura?.[vo])
  // "Kräver något av dig" = trakter där EN sak på trakten saknas och fylls i.
  // De 31 utan kundnummer räknas INTE hit: bolaget (Privat, Karl Hedin)
  // faktureras inte på vo-nummer, så det är ett beslut om bolaget — inte
  // fyrtiotre fält att fylla i. De har sin egen rad under "Vad ska du göra?".
  const kraverNagot = rader.filter(r => r.tillstand === 'atgard')

  // ── Högarna: faktureringens ordning ──────────────────────────────────────
  // Att fakturera och "går inte att se" gäller bara trakter maskinerna är klara
  // med. Fakturerat och Slutredovisat gäller ALLA trakter med en faktura —
  // fyra pågående och fyra i "kräver något av dig" var redan fakturerade i prod
  // 2026-10-25, och de får inte stå kvar som ofakturerade.
  const attFaktureraRader = faktura
    ? klaraRader.filter(r => lagetFor(r.vo_nummer) === 'ofakturerat')
    : klaraRader
  const okantRader = faktura ? klaraRader.filter(r => lagetFor(r.vo_nummer) === 'okant') : []

  // TIMPENG SLUTREDOVISAS INTE — den är klar så fort fakturan gått (Martin
  // 2026-10-25). Slutredovisningen hör till ackordet, där Vidas avräkning
  // avgör volym och pris. 14 av de 21 "väntar på slutredovisning" var
  // timpengtrakter som i själva verket var färdiga.
  //
  // Avtalsformen avgör alltså vad fakturan BETYDER, och det beslutet bor här,
  // inte i fakturaLage: den filen säger bara vad som står på fakturan.
  const klartRader = faktura
    ? rader.filter(r => {
        const l = lagetFor(r.vo_nummer)
        return l === 'slutredovisat' || (l === 'fakturerat' && r.avtalsform === 'timpeng')
      })
    : []
  const vantarSlutredRader = faktura
    ? rader.filter(r => lagetFor(r.vo_nummer) === 'fakturerat' && r.avtalsform !== 'timpeng')
    : []

  // ── Svaret ───────────────────────────────────────────────────────────────
  // Talet är antalet rader i "Att fakturera" — summan är summan av det som
  // visas. Trakter vi inte kan bedöma räknas inte in; de har sin egen hög.
  const svar = faktura
    ? {
        tal: String(attFaktureraRader.length),
        text: attFaktureraRader.length === 1 ? 'trakt att fakturera' : 'trakter att fakturera',
        under: kraverNagot.length > 0
          ? `${kraverNagot.length} ${kraverNagot.length === 1 ? 'trakt kräver' : 'trakter kräver'} något av dig`
          : null,
      }
    : {
        tal: String(klaraRader.length),
        text: klaraRader.length === 1 ? 'trakt klar att fakturera' : 'trakter klara att fakturera',
        under: kraverNagot.length > 0
          ? `${kraverNagot.length} ${kraverNagot.length === 1 ? 'trakt kräver' : 'trakter kräver'} något av dig`
          : null,
      }

  // ── Vad ska du göra? ─────────────────────────────────────────────────────
  const attGora: AttGoraRad[] = []

  const utanKontrakt = kraverNagot.filter(r => r.hinder_typ === 'kontraktsnr')
  if (utanKontrakt.length > 0) {
    const utanRad = utanKontrakt.filter(r => r.saknar_objektrad).length
    attGora.push({
      nyckel: 'kontraktsnr',
      titel: `${utanKontrakt.length} saknar kontraktsnummer`,
      under: utanRad > 0
        ? `${utanRad} av dem är inte upplagda som trakt än`
        : 'Numret står på Vidas kontrakt',
      vo: utanKontrakt.length === 1 ? utanKontrakt[0].vo_nummer : undefined,
    })
  }

  const utanTimmar = kraverNagot.filter(r => r.hinder_typ === 'traillertimmar')
  if (utanTimmar.length > 0) {
    // Alla fyra i prod 2026-10-25 var redan fakturerade. Att fylla i tiden
    // ändrar då ingen faktura som ska skickas — det ska stå på raden, annars
    // görs arbetet i onödan.
    const redan = utanTimmar.filter(r => {
      const l = lagetFor(r.vo_nummer)
      return l === 'fakturerat' || l === 'slutredovisat'
    }).length
    attGora.push({
      nyckel: 'traillertimmar',
      titel: `${utanTimmar.length} saknar traillertimmar`,
      under: redan === 0
        ? 'Tiden för en flytt över 3 mil'
        : redan === utanTimmar.length
          ? `Tiden för en flytt över 3 mil — ${redan === 1 ? 'den är redan fakturerad' : 'alla är redan fakturerade'}`
          : `Tiden för en flytt över 3 mil — ${redan} av dem är redan fakturerade`,
      vo: utanTimmar.length === 1 ? utanTimmar[0].vo_nummer : undefined,
    })
  }

  const utanKund = rader.filter(r => r.tillstand === 'ingen_gemensam_kund')
  if (utanKund.length > 0) {
    const bolag = Array.from(new Set(utanKund.map(r => r.bolag ?? 'bolag saknas'))).sort()
    attGora.push({
      nyckel: 'kund',
      titel: `${utanKund.length} saknar kundnummer i Fortnox`,
      under: `Gäller ${bolag.join(' och ')} — lägg in kundnumret på bolaget`,
      vo: utanKund.length === 1 ? utanKund[0].vo_nummer : undefined,
    })
  }

  // Handinknappade skotartimmar: finns i datan, men inte i priset. 810E kan
  // inte skicka filer, så för den maskinen är den manuella raden enda källan.
  const medManuellSkot = rader.filter(
    r => r.manuell_skotartid_tim > 0 && r.avtalsform === 'timpeng' && r.tillstand !== 'pagar',
  )
  if (medManuellSkot.length > 0) {
    const tim = medManuellSkot.reduce((s, r) => s + r.manuell_skotartid_tim, 0)
    attGora.push({
      nyckel: 'skotartimmar',
      titel: `${nr(tim)} skotartimmar är inte med i priset`,
      under: `Inknappade för hand på ${medManuellSkot.length} ${medManuellSkot.length === 1 ? 'timpengstrakt' : 'timpengstrakter'} — 810E kan inte skicka filer`,
      vo: medManuellSkot.length === 1 ? medManuellSkot[0].vo_nummer : undefined,
    })
  }

  if (utanTrakt && utanTrakt.poster > 0) {
    attGora.push({
      nyckel: 'arbete_utan_trakt',
      titel: `${utanTrakt.poster} ${utanTrakt.poster === 1 ? 'post' : 'poster'} manuellt arbete saknar trakt`,
      under: `${nr(utanTrakt.timmar, 2)} tim som inte kan hamna på någon faktura förrän de får en trakt`,
    })
  }

  // ── Högarna ──────────────────────────────────────────────────────────────
  const hogar: Hog[] = []

  if (!faktura) {
    // Fakturorna gick inte att läsa. Listan fungerar som förut och SÄGER att
    // den inte kan se vad som redan är skickat — den påstår aldrig motsatsen.
    lagg(hogar, {
      nyckel: 'klara',
      rubrik: 'Vad är klart att fakturera?',
      under: 'Fakturorna i Fortnox kunde inte läsas — går inte att se vad som redan är skickat.',
      varning: true,
      grupper: gruppera(klaraRader.map(r => ({ datum: r.avrakningsdatum, rad: traktRad(r) }))),
    })
  } else {
    lagg(hogar, {
      nyckel: 'att_fakturera',
      rubrik: 'Vad är klart att fakturera?',
      under: null,
      varning: false,
      grupper: gruppera(attFaktureraRader.map(r => ({ datum: r.avrakningsdatum, rad: traktRad(r) }))),
    })

    // Pricken står på HÖGEN, inte på varje rad: alla rader här är samma sak,
    // och en prick som upprepas på varje rad säger ingenting.
    lagg(hogar, {
      nyckel: 'okant_lage',
      rubrik: 'Vad går inte att se?',
      under: 'Utan kontraktsnummer går fakturan inte att hitta — därför vet vi inte om trakten är fakturerad.',
      varning: true,
      grupper: gruppera(okantRader.map(r => ({
        datum: r.avrakningsdatum,
        rad: { ...traktRad(r), under: 'Inget kontraktsnummer — går inte att se om den är fakturerad' },
      }))),
    })

    // Fakturorna grupperas på FAKTURADATUM, inte avräkningsdatum: det är
    // fakturan högen handlar om. Kunden står inte på raden — fakturanumret är
    // det man letar efter här, och bolaget syns när trakten öppnas.
    lagg(hogar, {
      nyckel: 'fakturerat',
      rubrik: 'Vad väntar på slutredovisning?',
      under: 'Ackord. Fakturan är skickad, slutredovisningen saknas på den.',
      varning: false,
      grupper: gruppera(vantarSlutredRader.map(r => {
        const f = senasteFakturan(faktura[r.vo_nummer])
        return {
          datum: f?.datum ?? null,
          rad: { ...traktRad(r), under: fakturaText(faktura[r.vo_nummer]) },
        }
      }), 'Utan fakturadatum'),
    })

    lagg(hogar, {
      nyckel: 'klart',
      rubrik: 'Vad är klart?',
      under: 'Timpeng är klart när fakturan gått. Ackord när slutredovisningen ligger på den.',
      varning: false,
      // Datumet är den dag trakten blev klar: slutredovisningens när det finns
      // en, annars fakturans. En timpengstrakt som ändå fått en
      // slutredovisning (Jätsbygd au 2026 i prod) säger det — datan går före.
      grupper: gruppera(klartRader.map(r => {
        const s = slutredovisningen(faktura[r.vo_nummer])
        const datum = kortDatum(s?.datum ?? null)
        return {
          datum: s?.datum ?? senasteFakturan(faktura[r.vo_nummer])?.datum ?? null,
          rad: {
            ...traktRad(r),
            under: s
              ? [datum ? `Slutredovisat ${datum}` : 'Slutredovisat', `faktura ${s.nummer}`].join(' · ')
              : fakturaText(faktura[r.vo_nummer]),
          },
        }
      }), 'Utan fakturadatum'),
    })
  }

  // ── Debiterbart arbete som inte kan faktureras än ────────────────────────
  // Arbetet är gjort och debiterbart, men trakten är inte klar. Det ska SYNAS,
  // inte ligga i en dämpad hög.
  //
  // MEDVETET: en trakt som vi hunnit fakturera men som inte är klar kan stå
  // både i sin fakturahög och här. Det är två olika saker — fakturan är
  // skickad, och arbetet går ändå inte att fakturera än — och vi vet inte om
  // arbetet låg med på den fakturan. Att dölja det ena vore att gissa. Inget
  // sådant fall finns i prod 2026-10-25 (de tre trakterna med debiterbart
  // arbete är ofakturerade).
  const arbeteVantar = rader
    .filter(r => r.debiterbart_arbete_tim > 0 && r.tillstand !== 'klar')
    .sort((a, b) => b.debiterbart_arbete_tim - a.debiterbart_arbete_tim)
    .map(r => ({
      vo: r.vo_nummer,
      titel: r.namn ?? `VO ${r.vo_nummer}`,
      under: !r.har_maskindata
        ? 'Trakten har ingen maskindata alls'
        : r.tillstand === 'ej_paborjad'
          ? 'Ingen maskin har rapporterat — trakten räknas som inte påbörjad'
          : r.tillstand === 'pagar'
            ? 'Trakten pågår'
            : (r.hinder ?? 'Trakten går inte att fakturera än'),
      hoger: nr(r.debiterbart_arbete_tim, 2),
      hogerUnder: 'tim',
      varning: true,
    }))

  // ── Vad väntar? ──────────────────────────────────────────────────────────
  // En trakt med debiterbart arbete ligger i gruppen ovan och räknas inte här.
  // En trakt vi redan fakturerat står i sin fakturahög och räknas inte heller —
  // fyra pågående trakter i prod 2026-10-25 var fakturerade, två av dem
  // slutredovisade.
  const iArbete = new Set(arbeteVantar.map(r => r.vo))
  const iFaktura = new Set([...vantarSlutredRader, ...klartRader].map(r => r.vo_nummer))
  const vantande = rader.filter(
    r => (r.tillstand === 'pagar' || r.tillstand === 'ej_paborjad')
      && !iArbete.has(r.vo_nummer) && !iFaktura.has(r.vo_nummer),
  )
  const pagar = vantande.filter(r => r.tillstand === 'pagar').length
  const ejPaborjad = vantande.filter(r => r.tillstand === 'ej_paborjad').length
  const vantar = vantande.length > 0
    ? {
        titel: `${vantande.length} ${vantande.length === 1 ? 'trakt väntar' : 'trakter väntar'}`,
        under: [
          pagar > 0 ? `${pagar} pågår` : null,
          ejPaborjad > 0 ? `${ejPaborjad} inte påbörjade` : null,
        ].filter(Boolean).join(' · '),
      }
    : null

  const kontraktsKo: KontraktsPost[] = [...utanKontrakt]
    .sort((a, b) => b.volym_m3fub - a.volym_m3fub)
    .map(r => ({
      vo: r.vo_nummer,
      namn: r.namn ?? `VO ${r.vo_nummer}`,
      under: `${r.bolag ?? 'bolag saknas'} · VO ${r.vo_nummer}${r.volym_m3fub > 0 ? ` · ${nr(r.volym_m3fub)} m³fub` : ''}`,
      saknarTrakt: r.saknar_objektrad,
    }))

  return {
    svar,
    attGora,
    hogar,
    arbeteVantar,
    vantar,
    kontraktsKo,
    fot: faktura
      ? 'Högarna följer fakturan i Fortnox, kopplad på kontraktsnumret. Priserna räknas när du öppnar en trakt.'
      : 'Listan kontrollerar kund, kontraktsnummer och traillertimmar. Priserna räknas när du öppnar en trakt.',
  }
}

/** "Faktura 2026181 · 19 okt". Två fakturor skrivs båda — datumet är den senastes. */
function fakturaText(f: TraktFaktura | undefined): string {
  const nummer = (f?.fakturor ?? []).map(x => x.nummer).join(', ')
  const datum = kortDatum(senasteFakturan(f)?.datum ?? null)
  return [nummer ? `Faktura ${nummer}` : 'Faktura', datum].filter(Boolean).join(' · ')
}

/** En tom hög ritas aldrig. */
function lagg(hogar: Hog[], hog: Hog): void {
  if (hog.grupper.length > 0) hogar.push(hog)
}

/** Nyast först, utan datum sist; namnet avgör inom samma dag. */
function gruppera(
  poster: { datum: string | null; rad: TraktRad }[],
  utanDatum = 'Utan avräkningsdatum',
): ManadsGrupp[] {
  const sorterad = [...poster].sort((a, b) => {
    if (a.datum !== b.datum) {
      if (!a.datum) return 1
      if (!b.datum) return -1
      return a.datum < b.datum ? 1 : -1
    }
    return a.rad.titel.localeCompare(b.rad.titel, 'sv')
  })
  const grupper = new Map<string, TraktRad[]>()
  const ordning: string[] = []
  for (const p of sorterad) {
    const rubrik = manadsRubrik(p.datum, utanDatum)
    if (!grupper.has(rubrik)) { grupper.set(rubrik, []); ordning.push(rubrik) }
    grupper.get(rubrik)!.push(p.rad)
  }
  return ordning.map(rubrik => ({ rubrik, rader: grupper.get(rubrik)! }))
}
