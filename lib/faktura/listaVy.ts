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
  klara: ManadsGrupp[]
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

const nr = (n: number, dec = 0) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: dec })

/** "Oktober 2026" ur ett ISO-datum. Utan datum: en egen hög sist. */
export function manadsRubrik(iso: string | null): string {
  if (!iso) return 'Utan avräkningsdatum'
  const [ar, man] = iso.split('-')
  const namn = MANADER[Number(man) - 1]
  if (!namn) return 'Utan avräkningsdatum'
  return `${namn[0].toUpperCase()}${namn.slice(1)} ${ar}`
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

export function byggListVy(rader: OversiktsRad[], utanTrakt: ArbeteUtanTrakt | null): ListVy {
  const klaraRader = rader.filter(r => r.tillstand === 'klar')
  // "Kräver något av dig" = trakter där EN sak på trakten saknas och fylls i.
  // De 31 utan kundnummer räknas INTE hit: bolaget (Privat, Karl Hedin)
  // faktureras inte på vo-nummer, så det är ett beslut om bolaget — inte
  // fyrtiotre fält att fylla i. De har sin egen rad under "Vad ska du göra?".
  const kraverNagot = rader.filter(r => r.tillstand === 'atgard')

  // ── Svaret ───────────────────────────────────────────────────────────────
  const svar = {
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
    attGora.push({
      nyckel: 'traillertimmar',
      titel: `${utanTimmar.length} saknar traillertimmar`,
      under: 'Tiden för en flytt över 3 mil',
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

  // ── Vad är klart att fakturera? ──────────────────────────────────────────
  const grupper = new Map<string, TraktRad[]>()
  const ordning: string[] = []
  for (const r of [...klaraRader].sort(sorteraNyastForst)) {
    const rubrik = manadsRubrik(r.avrakningsdatum)
    if (!grupper.has(rubrik)) { grupper.set(rubrik, []); ordning.push(rubrik) }
    grupper.get(rubrik)!.push(traktRad(r))
  }
  const klara: ManadsGrupp[] = ordning.map(rubrik => ({ rubrik, rader: grupper.get(rubrik)! }))

  // ── Debiterbart arbete som inte kan faktureras än ────────────────────────
  // Arbetet är gjort och debiterbart, men trakten är inte klar. Det ska SYNAS,
  // inte ligga i en dämpad hög.
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
  const iArbete = new Set(arbeteVantar.map(r => r.vo))
  const vantande = rader.filter(
    r => (r.tillstand === 'pagar' || r.tillstand === 'ej_paborjad') && !iArbete.has(r.vo_nummer),
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
    klara,
    arbeteVantar,
    vantar,
    kontraktsKo,
    fot: 'Listan kontrollerar kund, kontraktsnummer och traillertimmar. Priserna räknas när du öppnar en trakt.',
  }
}

/** Nyast avräknad först; utan datum sist (namnet avgör inom samma dag). */
function sorteraNyastForst(a: OversiktsRad, b: OversiktsRad): number {
  if (a.avrakningsdatum !== b.avrakningsdatum) {
    if (!a.avrakningsdatum) return 1
    if (!b.avrakningsdatum) return -1
    return a.avrakningsdatum < b.avrakningsdatum ? 1 : -1
  }
  return (a.namn ?? '').localeCompare(b.namn ?? '', 'sv')
}
