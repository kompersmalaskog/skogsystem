import { describe, expect, it } from 'vitest'
import { raknaSpar, planeratPerTyp, type PlaneratResultat } from './berakningar'
import { fmt, fmtDag } from './format'
import { gorDetta, klarRader, traktUnder, manuellaUtanLass, sidSvar, sparKort, egenSkotningVy, EGEN_SKOTNING_NOT, GOR_SYNLIGA, type GorIndata } from './kort'
import { lasKlar, medUppskattadPrognos, raknaAlla, type KlarData } from './klar'
import type { UtfallRad } from '@/lib/g15Forslag'
import fixtur from './__fixtures__/klar_2026-10-17.json'
import type { Arbetsdagar, Maskin, MaskinStopp, PlaneringObjekt, SparRad, Typ } from './queries'

// Oktober 2026 ur prod (helikopter_ny_spar/_arbetsdagar för 2026-10-17: 12 arbetsdagar gångna, 10 kvar). Samma tal som svar.test.ts.
const okt: Arbetsdagar = {
  maskin_id: null, totalt: 22, gangna: 12, kvar: 10,
  gangna_datum: ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'],
  kvar_datum: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'],
}
const rad = (typ: Typ, x: Partial<SparRad>): SparRad => ({
  typ, bas: 'bestallt', bestallt: 5000, bolag: ['Vida'], skordat: 1985, skotat: 718, takt_skordat: 366.4, takt_skotat: 114.3,
  takt_dagar: 5, takt_fonster: [], oskotat_forandring_per_dag: 252.1, ingaende_oskotat: 912, oskotat_objekt: [], ...x,
})
const gallOkt = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 665.1485, skotat: 714, takt_skordat: 55.9, takt_skotat: 0, ingaende_oskotat: 0 }), okt)
const slutOkt = raknaSpar(rad('slutavverkning', { bestallt: 5000, skordat: 2498.7337, skotat: 3235.5, takt_skordat: 160.4, takt_skotat: 374.6, ingaende_oskotat: 0 }), okt)
// Landar på beställningen: skördat 900 + 12 × 10 = 1 020, skotat 800 + 22 × 10 = 1 020 (kapas vid skördat) — 2 % över, inom ±5 %.
const gallOk = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 900, skotat: 800, takt_skordat: 12, takt_skotat: 22, ingaende_oskotat: 0 }), okt)
// Över: skördat 900 + 20 × 10 = 1 100, skotat 800 + 30 × 10 = 1 100 — 10 % över.
const gallOver = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 900, skotat: 800, takt_skordat: 20, takt_skotat: 30, ingaende_oskotat: 0 }), okt)

describe('sparKort — talet är ALLTID skotat hittills, prognosen står i `landar`, ordet säger vad som gäller', () => {
  it('fattas: oktober 2026 ur prod (gallring skotat 714 av 1 000, skotaren står still)', () => {
    const k = sparKort(gallOkt, 'pagaende', 3)
    expect(k).toMatchObject({ namn: 'Gallring', lage: 'fattas', ord: 'Fattas 286', ton: 'orange', tal: 714, landar: 714, av: 1000 })
    expect(k.andel).toBeCloseTo(0.714, 3)
    expect(k.prognosAndel).toBeCloseTo(0.714, 3)
    expect(k.planAndel).toBeCloseTo(12 / 22, 6)
  })
  it('hinner: grön, talet är skotat hittills (800), prognosen 1 020 står i landar, stapeln får en mörk del fram till prognosen', () => {
    const k = sparKort(gallOk, 'pagaende', 3)
    expect(k).toMatchObject({ lage: 'hinner', ord: 'Hinner', ton: 'gron', tal: 800, landar: 1020, av: 1000 })
    expect(k.andel).toBeCloseTo(0.8, 6)
    expect(k.prognosAndel).toBe(1)
  })
  it('över beställt (> 5 %) är dämpat, inte grönt, och säger med hur mycket', () => {
    expect(sparKort(gallOver, 'pagaende', 3)).toMatchObject({ lage: 'over', ord: 'Över med 100', ton: 'dampad', tal: 800, landar: 1100 })
  })
  it('klar: skotat hittills ≥ beställt', () => {
    const framme = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 1100, skotat: 1000, takt_skordat: 10, takt_skotat: 10, ingaende_oskotat: 0 }), okt)
    expect(sparKort(framme, 'pagaende', 3)).toMatchObject({ lage: 'klar', ord: 'Klar', ton: 'gron' })
  })
  it('ingen prognos före arbetsdag 4: "Hittills", talet är skotat hittills, ingen mörk del', () => {
    const tidig = raknaSpar(rad('gallring', { bestallt: 1000, skotat: 120, takt_dagar: 2 }), okt)
    expect(sparKort(tidig, 'pagaende', 3)).toMatchObject({ lage: 'hittills', ord: 'Hittills', ton: 'dampad', tal: 120, landar: null, av: 1000, prognosAndel: null })
  })
  it('inga trakter planerade: dämpat, inget planstreck — aldrig grönt utan plan', () => {
    expect(sparKort(gallOk, 'pagaende', 0)).toMatchObject({ lage: 'inga_trakter', ord: 'Inga trakter', ton: 'dampad', tal: 800, planAndel: null })
  })
  it('ingen beställning: inget "av", ingen stapel', () => {
    const utan = raknaSpar(rad('gallring', { bestallt: 0, skotat: 356 }), okt)
    expect(sparKort(utan, 'pagaende', 3)).toMatchObject({ lage: 'ingen_bestallning', ton: 'dampad', tal: 356, av: null, andel: null })
  })
  it('kommande månad: Inte startad, 0 av beställt', () => {
    expect(sparKort(gallOk, 'kommande', 0)).toMatchObject({ lage: 'inte_startad', ord: 'Inte startad', ton: 'dampad', tal: 0, av: 1000, andel: 0 })
  })
  it('avslutad månad: Klar eller Fattas på skotat hittills, inget planstreck', () => {
    expect(sparKort(gallOkt, 'avslutad', 3)).toMatchObject({ lage: 'fattas', ord: 'Fattas 286', ton: 'orange', tal: 714, landar: null, planAndel: null })
    const natt = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 1100, skotat: 1004.6 }), okt)
    expect(sparKort(natt, 'avslutad', 3)).toMatchObject({ lage: 'klar', ord: 'Klar', ton: 'gron', tal: 1005 })
  })
})

describe('sidSvar — EN mening i vanliga ord', () => {
  const k = (spar: typeof gallOk[], status: 'pagaende' | 'avslutad' | 'kommande' = 'pagaende', n = 3) => spar.map(s => sparKort(s, status, n))
  it('fattas går först, med varningsikon', () => {
    expect(sidSvar(k([gallOkt, slutOkt]), 'pagaende')).toEqual({ rubrik: 'Vi hinner inte med beställningen', avvikelse: true })
    expect(sidSvar(k([gallOk, slutOkt]), 'pagaende')).toEqual({ rubrik: 'Vi hinner inte med beställningen', avvikelse: true })
  })
  it('allt hinner', () => {
    expect(sidSvar(k([gallOk]), 'pagaende')).toEqual({ rubrik: 'Vi hinner med beställningen', avvikelse: false })
  })
  it('över är inte en avvikelse', () => {
    expect(sidSvar(k([gallOver]), 'pagaende')).toEqual({ rubrik: 'Vi hinner mer än beställt', avvikelse: false })
  })
  it('inga trakter planerade nämns med spårets namn', () => {
    expect(sidSvar(k([gallOk], 'pagaende', 0), 'pagaende')).toEqual({ rubrik: 'Gallring har inga trakter', avvikelse: false })
  })
  it('för tidigt för prognos', () => {
    const tidig = raknaSpar(rad('gallring', { bestallt: 1000, takt_dagar: 2 }), okt)
    expect(sidSvar(k([tidig]), 'pagaende').rubrik).toBe('För tidigt för prognos – kommer dag 4')
  })
  it('ingen beställning · kommande · avslutad · allt klart', () => {
    const utan = raknaSpar(rad('gallring', { bestallt: 0 }), okt)
    expect(sidSvar(k([utan]), 'pagaende').rubrik).toBe('Ingen beställning inlagd')
    expect(sidSvar(k([gallOk], 'kommande'), 'kommande').rubrik).toBe('Månaden har inte börjat')
    expect(sidSvar(k([gallOkt], 'avslutad'), 'avslutad')).toEqual({ rubrik: 'Vi hann inte med beställningen', avvikelse: true })
    const natt = raknaSpar(rad('gallring', { bestallt: 1000, skotat: 1000 }), okt)
    expect(sidSvar(k([natt], 'avslutad'), 'avslutad')).toEqual({ rubrik: 'Beställningen blev klar', avvikelse: false })
    const framme = raknaSpar(rad('gallring', { bestallt: 1000, skordat: 1100, skotat: 1000, takt_skordat: 10, takt_skotat: 10, ingaende_oskotat: 0 }), okt)
    expect(sidSvar(k([framme]), 'pagaende').rubrik).toBe('Beställningen är klar')
  })
})

// ── Gör detta ──
const giant: Maskin = { maskin_id: 'PONS', modell: 'Scorpion', visningsnamn: 'Giant', maskin_typ: 'Harvester', klarar_typ: 'slutavverkning', extramaskin: false, aktiv_till: null }
const jd: Maskin = { maskin_id: 'JD810E', modell: '810E', visningsnamn: '810E', maskin_typ: 'Forwarder', klarar_typ: 'bada', extramaskin: false, aktiv_till: null }
const stopp = (x: Partial<MaskinStopp>): MaskinStopp => ({
  maskin_id: 'PONS', namn: 'Giant', roll: 'skordare', stopp_fran: null, stopp_till: null, stopp_orsak: null, stopp_status: null, stopp_kor_igen: null,
  stopp_dagar: null, stopp_dagar_gangna: null, stopp_dagar_manad: 0, stopp_orsaker_manad: [], oforklarade_datum: [], takt_fran: null, ...x,
})
const objekt = (x: Partial<PlaneringObjekt>): PlaneringObjekt => ({
  objekt_id: 'o1', namn: '400763 Vällust -26', vo_nummer: '400763', typ: 'gallring', bolag: 'Vida', volym: 500, status: 'planerad',
  skordare_maskin_id: 'R64428', skotare_maskin_id: 'A030353', skordare_utforare: null, skotare_utforare: null, prognos_skordare_h: 10, prognos_skotare_h: 10,
  klar_skordare: false, klar_skotare: false, ...x,
})
const planOk: Record<Typ, PlaneratResultat> = {
  gallring: planeratPerTyp([objekt({ volym: 1000 })], 'gallring', 1000, []),
  slutavverkning: planeratPerTyp([objekt({ objekt_id: 'o2', typ: 'slutavverkning', volym: 5000 })], 'slutavverkning', 5000, []),
}
const bas: GorIndata = {
  status: 'pagaende', maskinStopp: [], manuella: new Set(), maskiner: [giant, jd], senasteLass: {}, arbetsdagar: [okt], rapportdagar: null,
  idag: '2026-10-17', manadNamn: 'oktober', utanTyp: [], planering: [objekt({ volym: 1000 }), objekt({ objekt_id: 'o2', typ: 'slutavverkning', volym: 5000 })], plan: planOk,
  klar: null, planer: null,
}
const prodKlar = (): KlarData => lasKlar(structuredClone(fixtur))
const medPlaner = (d: KlarData): Pick<GorIndata, 'klar' | 'planer'> => ({ klar: d, planer: raknaAlla(d) })

describe('gorDetta — handlingar, viktigast först', () => {
  it('inget att göra = inga rader (inget kort)', () => {
    expect(gorDetta(bas)).toEqual([])
  })
  it('oförklarat stopp: orange, öppnar Maskiner', () => {
    const r = gorDetta({ ...bas, maskinStopp: [stopp({ oforklarade_datum: ['2026-10-14', '2026-10-15', '2026-10-16'] })] })
    expect(r).toEqual([{ id: 'stod:PONS', text: 'Giant körde inte ons–fre', under: 'Ingen ledighet registrerad', oppnar: 'maskiner', orange: true }])
  })
  it('manuell maskin (810E) utan lass är "inga lass", aldrig "körde inte" — ett larm, inte två', () => {
    const r = gorDetta({
      ...bas, manuella: new Set(['JD810E']), senasteLass: { JD810E: '2026-10-12' },
      maskinStopp: [stopp({ maskin_id: 'JD810E', namn: '810E', oforklarade_datum: ['2026-10-15', '2026-10-16'] })],
      rapportdagar: { JD810E: okt.gangna_datum },
    })
    expect(r).toEqual([{ id: 'lass:JD810E', text: '810E har inga lass sedan måndag', under: 'Lassen registreras för hand', oppnar: 'maskiner', orange: true }])
  })
  it('lass finns en av de två senaste rapportdagarna: inget larm', () => {
    expect(manuellaUtanLass([jd], { JD810E: '2026-10-15' }, [okt], '2026-10-17', 'oktober', { JD810E: okt.gangna_datum })).toEqual([])
  })
  it('utan klar-underlag: trakter utan maskin ur planeringen, dämpade (information, inte larm)', () => {
    const en = gorDetta({ ...bas, planering: [objekt({ volym: 1000, skordare_maskin_id: null }), objekt({ objekt_id: 'o2', typ: 'slutavverkning', volym: 5000 })] })
    expect(en.map(r => [r.id, r.text, r.oppnar, r.orange])).toEqual([['ej', 'Vällust har ingen maskin', 'ej', false]])
  })
  it('beställt utan trakter → "saknar N m³fub trakter", öppnar Mot beställning', () => {
    const plan = { ...planOk, gallring: planeratPerTyp([objekt({ volym: 600 })], 'gallring', 1000, []) }
    expect(gorDetta({ ...bas, plan })).toEqual([{ id: 'saknas:gallring', text: 'Gallring saknar 400 m³fub trakter', under: 'Beställt mer än trakterna rymmer', oppnar: 'best', orange: false }])
  })
  it('objekt utan typ eller bolag: summan, och ett läsfel är ett fel (ladda om)', () => {
    const r = gorDetta({ ...bas, utanTyp: [{ objekt_id: 'x', namn: 'X', vo_nummer: null, huvudtyp: null, bolag: null, skordat: 100, skotat: 50, volym: 150.4, senast_datum: null, objekt_uuid: null }] })
    expect(r).toEqual([{ id: 'utan', text: '150 m³fub saknar typ eller bolag', under: 'Räknas inte mot beställningen', oppnar: 'utan', orange: false }])
    expect(gorDetta({ ...bas, utanTyp: null })[0]).toMatchObject({ id: 'utan', oppnar: 'ladda_om' })
  })
  it('maskin klar efter månadens slut står först (orange), räknad i appen ur underlaget; trakter utan maskin kommer ur underlaget', () => {
    const d = prodKlar()
    const planer = raknaAlla(d)
    const sena = Object.values(planer).filter(p => p.efterManad)
    expect(sena.length).toBeGreaterThan(0)
    const r = gorDetta({ ...bas, klar: d, planer })
    const forst = r.find(x => x.id.startsWith('klar:') || x.id === 'flytt')!
    expect(r.indexOf(forst)).toBe(0)
    if (forst.id !== 'flytt') expect(forst).toMatchObject({ orange: true, oppnar: `maskin:${sena[0].maskin.maskin_id}` })
    // Högst GOR_SYNLIGA på sidan — resten bakom "N saker till" (sidan skär).
    expect(GOR_SYNLIGA).toBe(3)
  })
  it('avslutad månad: inga stopp-, lass-, trakt- eller klar-rader (bara utan typ)', () => {
    const r = gorDetta({ ...bas, status: 'avslutad', maskinStopp: [stopp({ oforklarade_datum: ['2026-10-14'] })], ...medPlaner(prodKlar()), planering: [objekt({ skordare_maskin_id: null })] })
    expect(r).toEqual([])
  })
})

describe('klarRader — namn och datum, trakterna bakom trycket', () => {
  const d = prodKlar()
  const planer = raknaAlla(d)
  it('samma maskiner som RPC:n, i samma ordning, med datum, – eller ?', () => {
    const r = klarRader(d, planer, null)
    expect(r.map(x => x.maskin_id)).toEqual(d.maskiner.map(m => m.maskin_id))
    for (const x of r) {
      const p = planer[x.maskin_id]
      if (p.rader.length === 0) expect(x).toMatchObject({ hoger: '–', dampad: true, orange: false })
      else if (p.saknar) expect(x).toMatchObject({ hoger: '?', dampad: true, orange: false })
      else expect(x).toMatchObject({ hoger: fmtDag(p.klar!), dampad: false, orange: p.efterManad })
      expect(x.trakter.length).toBe(p.rader.length)
    }
  })
  it('stoppet står under maskinen bara när hon står', () => {
    const m = d.maskiner.find(x => planer[x.maskin_id].rader.length > 0)!
    const r = klarRader(d, planer, [stopp({ maskin_id: m.maskin_id, namn: m.namn, stopp_fran: '2026-10-19', stopp_till: '2026-10-20', stopp_status: 'kommande', stopp_orsak: 'ledig:Stefan', stopp_kor_igen: '2026-10-21' })])
    expect(r.find(x => x.maskin_id === m.maskin_id)!.under).toBe('Står 19–20 okt · Stefan ledig · kör igen 21 okt')
    expect(klarRader(d, planer, null).find(x => x.maskin_id === m.maskin_id)!.under).toBeNull()
  })
})

describe('medUppskattadPrognos — en trakt utan prognos får G15-förslaget, datumet blir "ca"', () => {
  const utfall: UtfallRad[] = Array.from({ length: 8 }, (_, i) => ({ typ: 'slutavverkning', volymObjekt: 1000, skordadM3: 1000, stammar: 1200 + i * 10, skordareG15: 25, skotareG15: 40 + i }))
  it('fyller timmar och märker trakten; datumet räknas ur förslaget', () => {
    // Fixturen har ingen slutavverkning utan prognos: gör en av den första trakten på en mätt maskin.
    const d0 = prodKlar()
    const matt = d0.maskiner.find(m => !m.manuell)!
    const d: KlarData = { ...d0, trakter: d0.trakter.map((t, i) => (i === 0 ? { ...t, typ: 'slutavverkning', maskin_id: matt.maskin_id, roll: matt.roll, timmar: null, saknar_prognos: true, volym: 800, medelstam: null } : t)) }
    const utan = d.trakter[0]
    const d2 = medUppskattadPrognos(d, utfall)
    const t2 = d2.trakter.find(t => t.objekt_id === utan!.objekt_id && t.roll === utan!.roll)!
    expect(t2.uppskattad).toBe(true)
    expect(t2.saknar_prognos).toBe(false)
    expect(t2.timmar).toBeGreaterThan(0)
    const p = raknaAlla(d2)[utan!.maskin_id!]
    expect(p.uppskattad).toBe(true)
    const rad = klarRader(d2, raknaAlla(d2), null).find(r => r.maskin_id === utan!.maskin_id)!
    if (!p.saknar) expect(rad.hoger).toMatch(/^ca /)
  })
  it('utan utfall ändras inget; GROT får inget förslag', () => {
    const d = prodKlar()
    expect(medUppskattadPrognos(d, null)).toBe(d)
    const grot: KlarData = { ...d, trakter: [{ ...d.trakter[0], typ: 'grot', timmar: null, saknar_prognos: true }] }
    expect(medUppskattadPrognos(grot, utfall).trakter[0].uppskattad).toBeUndefined()
  })
})

describe('traktUnder — raden under trakten i Klar-arket', () => {
  it('följer takten går före "räknat på liknande trakter", och säger hur mycket', () => {
    expect(traktUnder({})).toBeNull()
    expect(traktUnder({ uppskattad: true })).toBe('Prognos räknad på liknande trakter')
    expect(traktUnder({ uppskattad: true, foljer: { restPlanH: 10, skillnad: 0.12, utfortH: 8 } })).toBe('Följer takten på trakten · 12 % fortare än prognosen')
    expect(traktUnder({ foljer: { restPlanH: null, skillnad: null, utfortH: 8 } })).toBe('Följer takten på trakten')
  })
})

describe('egenSkotningVy — en egen rubrik, inget annat (Martin 2026-10-25)', () => {
  // Prod oktober 2026: Trestensdal (Vida) och Trolleboda (privat P-VO) har egen skotning; Trestensdal är 178,4 m³fub skördat.
  const rader = [
    { objekt_id: '11124748', namn: 'Trestensdal gallring 2025.', vo_nummer: '11124748', typ: 'gallring', bolag: 'Vida', skordat: 178.4, senast_datum: '2026-10-10' },
    { objekt_id: 'R64428_53', namn: 'Görgen Gustafsson Trolleboda', vo_nummer: 'P-1025', typ: 'gallring', bolag: 'Privat', skordat: 30.5, senast_datum: '2026-10-23' },
  ]
  it('en rad per objekt: kortnamn, typ · bolag, skördat i m³fub', () => {
    const vy = egenSkotningVy(rader)
    expect(vy.map(r => r.namn)).toEqual(['Trestensdal gallring', 'Görgen Gustafsson Trolleboda'])
    expect(vy[0].under).toBe('Gallring · Vida')
    expect(vy[0].tal).toBe(`${fmt(178.4)} m³fub`)
    expect(vy[1].under).toBe('Gallring · Privat')
    expect(vy[1].tal).toBe('31 m³fub')
  })
  it('noll skördat visas inte; saknad typ och bolag sägs, aldrig gissas', () => {
    expect(egenSkotningVy([{ ...rader[0], skordat: 0 }])).toEqual([])
    expect(egenSkotningVy([{ ...rader[0], typ: null, bolag: null }])[0].under).toBe('typ saknas')
    expect(egenSkotningVy([{ ...rader[0], typ: null }])[0].under).toBe('Vida')
  })
  it('noten säger att det inte räknas mot beställningen', () => {
    expect(EGEN_SKOTNING_NOT).toContain('räknas inte mot beställningen')
  })
})
