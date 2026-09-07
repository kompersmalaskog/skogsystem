import { describe, it, expect } from 'vitest'
import {
  planIdag, behovPerDag, dagarEfter, prognosSkotat, klartDatum, oskotatStatus, skordareDagarFore,
  harPrognos, planeratPerTyp, belaggning, timmarForTyp, atgardForTyp, raknaSpar, manadStatus, valjBas,
  OSKOTAT_I_TAKT_M3_PER_DAG,
} from './berakningar'
import type { Arbetsdagar, Avvikelse, Maskin, PlaneringObjekt, SparRad } from './queries'

const fmt = (n: number) => String(Math.round(n))

describe('läge', () => {
  it('plan idag = beställt × gångna/totalt', () => {
    expect(planIdag(1400, 11, 22)).toBe(700)
    expect(planIdag(1400, 0, 0)).toBe(0)
  })
  it('behov per dag = (beställt − skotat) / kvar', () => {
    expect(behovPerDag(1400, 590, 12)).toBeCloseTo(67.5)
    expect(behovPerDag(1400, 1500, 12)).toBe(0)
    expect(behovPerDag(1400, 590, 0)).toBeNull()
  })
  it('dagar efter: |x| < 1 = på plan, annars hela dagar', () => {
    expect(dagarEfter(700, 590, 38)).toEqual({ status: 'efter', dagar: 3 })   // 110/38 = 2,9
    expect(dagarEfter(700, 680, 38)).toEqual({ status: 'pa_plan', dagar: 0 }) // 20/38 = 0,5
    expect(dagarEfter(700, 790, 38)).toEqual({ status: 'fore', dagar: 2 })    // −90/38 = −2,4
    expect(dagarEfter(700, 590, null)).toBeNull()
    expect(dagarEfter(700, 590, 0)).toBeNull()
  })
  it('prognos skotat kapas vid ingående oskotat + prognos skördat, aldrig under redan skotat', () => {
    expect(prognosSkotat(590, 40, 12, 2000)).toBe(1070)
    expect(prognosSkotat(590, 40, 12, 900)).toBe(900)
    expect(prognosSkotat(590, 40, 12, 900, 300)).toBe(1070)   // 900 + 300 = 1 200 > 1 070
    // gallring sept 2026: skotat 294 > månadens skördat 136, men 1 921 låg oskotat vid månadsstart
    expect(prognosSkotat(294, 55, 18, 136 + 25.6 * 18, 1921)).toBeCloseTo(294 + 55 * 18)
    // utan ingående: taket = prognos skördat
    expect(prognosSkotat(294, 55, 18, 136 + 25.6 * 18)).toBeCloseTo(136 + 25.6 * 18)
    expect(prognosSkotat(294, 0, 18, 100)).toBe(294)
  })
  it('klart datum = n:te arbetsdagen kvar', () => {
    const kvar = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26']
    expect(klartDatum(1400, 1250, 40, kvar)).toBe('2026-10-23') // 150/40 = 3,75 → dag 4
    expect(klartDatum(1400, 1400, 40, kvar)).toBe('2026-10-20') // redan klart
    expect(klartDatum(1400, 1000, 40, kvar)).toBeNull()         // 10 dagar > 5 kvar
    expect(klartDatum(1400, 1250, null, kvar)).toBeNull()
  })
  it('oskotat i takt inom ± halvt lass', () => {
    expect(oskotatStatus(OSKOTAT_I_TAKT_M3_PER_DAG)).toBe('i_takt')
    expect(oskotatStatus(OSKOTAT_I_TAKT_M3_PER_DAG + 0.1)).toBe('vaxer')
    expect(oskotatStatus(-30)).toBe('minskar')
    expect(oskotatStatus(null)).toBeNull()
  })
  it('skördaren dagar före = oskotat / skotarens takt', () => {
    expect(skordareDagarFore(220, 55)).toBe(4)
    expect(skordareDagarFore(-50, 55)).toBe(0)
    expect(skordareDagarFore(220, null)).toBeNull()
  })
  it('prognos från arbetsdag 4 (tre gångna dagar)', () => {
    expect(harPrognos(2)).toBe(false)
    expect(harPrognos(3)).toBe(true)
  })
  it('bas: beställda bolag när beställning finns, annars alla', () => {
    const rader: SparRad[] = [
      { typ: 'gallring', bas: 'bestallt', bestallt: 0, bolag: [], skordat: 10, skotat: 5, takt_skordat: null, takt_skotat: null, takt_dagar: 0, takt_fonster: [], oskotat_forandring_per_dag: null, ingaende_oskotat: 0 },
      { typ: 'gallring', bas: 'totalt', bestallt: 0, bolag: [], skordat: 30, skotat: 15, takt_skordat: null, takt_skotat: null, takt_dagar: 0, takt_fonster: [], oskotat_forandring_per_dag: null, ingaende_oskotat: 0 },
    ]
    expect(valjBas(rader, 'gallring')?.skordat).toBe(30)
    rader[0].bestallt = 1000
    expect(valjBas(rader, 'gallring')?.skordat).toBe(10)
  })
  it('raknaSpar på september 2026-siffrorna (slutavverkning)', () => {
    const rad: SparRad = { typ: 'slutavverkning', bas: 'bestallt', bestallt: 5000, bolag: ['Vida'], skordat: 1621.6, skotat: 470.5, takt_skordat: 322.1, takt_skotat: 86.3, takt_dagar: 4, takt_fonster: [], oskotat_forandring_per_dag: 235.9, ingaende_oskotat: 1660 }
    const dagar: Arbetsdagar = { maskin_id: null, totalt: 22, gangna: 4, kvar: 18, gangna_datum: [], kvar_datum: [] }
    const s = raknaSpar(rad, dagar)
    expect(s.harPrognos).toBe(true)
    expect(s.plan).toBeCloseTo(909.1, 0)
    expect(s.lage).toEqual({ status: 'efter', dagar: 5 })          // (909 − 470)/86,3 = 5,1
    expect(s.behovPerDag).toBeCloseTo(251.6, 0)                    // (5000 − 470,5)/18
    expect(s.prognosSkordat).toBeCloseTo(1621.6 + 322.1 * 18, 0)   // 7 419
    expect(s.prognosSkotat).toBeCloseTo(470.5 + 86.3 * 18, 0)      // 2 024 (under skördat-taket)
    expect(s.oskotatStatus).toBe('vaxer')
    expect(s.skordareDagarFore).toBe(13)                           // 1151/86,3
    expect(s.klartDatumSkotat).toBeNull()                          // prognos < beställt
  })
  it('raknaSpar gallring september 2026: ingående oskotat lyfter taket → klart 23 sep', () => {
    const kvar = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-28', '2026-09-29', '2026-09-30']
    const rad: SparRad = { typ: 'gallring', bas: 'bestallt', bestallt: 1000, bolag: ['Vida'], skordat: 136, skotat: 294, takt_skordat: 25.6, takt_skotat: 55, takt_dagar: 4, takt_fonster: [], oskotat_forandring_per_dag: -29.4, ingaende_oskotat: 1921 }
    const dagar: Arbetsdagar = { maskin_id: null, totalt: 22, gangna: 4, kvar: 18, gangna_datum: [], kvar_datum: kvar }
    const s = raknaSpar(rad, dagar)
    expect(s.prognosSkotat).toBeCloseTo(1284)                     // 294 + 55 × 18, under taket 1 921 + 597
    expect(s.lage).toEqual({ status: 'fore', dagar: 2 })          // (182 − 294)/55 = −2,0
    expect(s.klartDatumSkotat).toBe('2026-09-23')                 // 706/55 = 12,8 → 13:e arbetsdagen kvar
    expect(s.oskotatStatus).toBe('minskar')
  })
})

describe('planering: volym med bolagskorrigering', () => {
  const obj = (n: string, volym: number | null, bolag: string | null, typ = 'slutavverkning'): PlaneringObjekt => ({
    objekt_id: n, namn: n, vo_nummer: null, typ, bolag, volym, status: 'planerad',
    skordare_maskin_id: null, skotare_maskin_id: null, skordare_utforare: null, skotare_utforare: null,
    prognos_skordare_h: null, prognos_skotare_h: null, klar_skordare: false, klar_skotare: false,
  })
  const hist: Avvikelse[] = [{ bolag: 'Vida', typ: 'slutavverkning', antal: 12, medel_kvot: 1.048, std_kvot: 0.347 }]

  it('korrigerar med historik ≥ 5 objekt och flaggar mot spridningen', () => {
    const r = planeratPerTyp([obj('a', 1000, 'Vida'), obj('b', 250, 'Vida')], 'slutavverkning', 5000, hist)
    expect(r.planerat).toBe(1250)
    expect(r.korrigerat).toBeCloseTo(1310)
    expect(r.justeringProcent).toBe(5)
    expect(r.gap).toBeCloseTo(3690)
    expect(r.grans).toBeCloseTo(1250 * 0.347)
    expect(r.saknas).toBeCloseTo(3690)
  })
  it('utan historik: ingen korrigering, 10 %-gräns', () => {
    const r = planeratPerTyp([obj('a', 1350, 'Södra')], 'slutavverkning', 1400, hist)
    expect(r.justeringProcent).toBeNull()
    expect(r.grans).toBe(140)
    expect(r.saknas).toBe(0) // gap 50 < 140
    const r2 = planeratPerTyp([obj('a', 1200, 'Södra')], 'slutavverkning', 1400, hist)
    expect(r2.saknas).toBe(200)
  })
  it('för få avslutade objekt = ingen korrigering', () => {
    const r = planeratPerTyp([obj('a', 1000, 'Vida')], 'slutavverkning', 1000, [{ bolag: 'Vida', typ: 'slutavverkning', antal: 4, medel_kvot: 0.5, std_kvot: 0.1 }])
    expect(r.korrigerat).toBe(1000)
    expect(r.justeringProcent).toBeNull()
  })
  it('objekt utan volym eller bolag räknas inte med men räknas', () => {
    const r = planeratPerTyp([obj('a', 1000, 'Vida'), obj('b', null, 'Vida'), obj('c', 300, null)], 'slutavverkning', 0, hist)
    expect(r.antalObjekt).toBe(1)
    expect(r.utanVolym).toBe(1)
    expect(r.utanBolag).toBe(1)
    expect(r.saknas).toBe(0) // ingen beställning → inget gap att flagga
  })
})

describe('planering: timmar och åtgärd', () => {
  const maskiner: Maskin[] = [
    { maskin_id: 'SCORP', modell: 'Scorpion', maskin_typ: 'Harvester', klarar_typ: 'bada', extramaskin: false, aktiv_till: null },
    { maskin_id: 'R64428', modell: 'Rottne', maskin_typ: 'Harvester', klarar_typ: 'bada', extramaskin: false, aktiv_till: null },
    { maskin_id: 'WIS', modell: 'Wisent', maskin_typ: 'Forwarder', klarar_typ: 'bada', extramaskin: false, aktiv_till: null },
    { maskin_id: 'JD', modell: '810E', maskin_typ: 'Forwarder', klarar_typ: 'bada', extramaskin: true, aktiv_till: null },
    { maskin_id: 'SOLD', modell: 'Elefant', maskin_typ: 'Forwarder', klarar_typ: null, extramaskin: false, aktiv_till: '2026-07-08' },
  ]
  const dagar: Arbetsdagar[] = [
    { maskin_id: null, totalt: 22, gangna: 4, kvar: 18, gangna_datum: [], kvar_datum: [] },
    { maskin_id: 'SCORP', totalt: 22, gangna: 4, kvar: 2, gangna_datum: [], kvar_datum: [] }, // semester
    { maskin_id: 'R64428', totalt: 22, gangna: 4, kvar: 18, gangna_datum: [], kvar_datum: [] },
    { maskin_id: 'WIS', totalt: 22, gangna: 4, kvar: 18, gangna_datum: [], kvar_datum: [] },
  ]
  const o = (n: string, typ: string, sk: string | null, st: string | null, hs: number | null, ht: number | null, extra: Partial<PlaneringObjekt> = {}): PlaneringObjekt => ({
    objekt_id: n, namn: n, vo_nummer: null, typ, bolag: 'Vida', volym: 100, status: 'planerad',
    skordare_maskin_id: sk, skotare_maskin_id: st, skordare_utforare: null, skotare_utforare: null,
    prognos_skordare_h: hs, prognos_skotare_h: ht, klar_skordare: false, klar_skotare: false, ...extra,
  })

  it('extramaskin och såld maskin har ingen kapacitet; kvar-dagar i pågående månad', () => {
    const bel = belaggning([], maskiner, dagar, '2026-09-07', true)
    expect(bel.map(b => b.maskin.maskin_id)).toEqual(['SCORP', 'R64428', 'WIS'])
    expect(bel.find(b => b.maskin.maskin_id === 'SCORP')?.kapacitetH).toBe(16)
    expect(bel.find(b => b.maskin.maskin_id === 'WIS')?.kapacitetH).toBe(144)
  })
  it('klara objekt och egen/extern utförare räknas bort', () => {
    const objekt = [
      o('a', 'slutavverkning', 'SCORP', 'WIS', 10, 20, { klar_skordare: true }),
      o('b', 'slutavverkning', 'SCORP', 'WIS', 26, 38),
      o('c', 'gallring', 'R64428', 'WIS', 5, 9, { skotare_utforare: 'egen' }),
    ]
    const bel = belaggning(objekt, maskiner, dagar, '2026-09-07', true)
    expect(bel.find(b => b.maskin.maskin_id === 'SCORP')?.belagtH).toBe(26)
    expect(bel.find(b => b.maskin.maskin_id === 'WIS')?.belagtH).toBe(58)
    expect(bel.find(b => b.maskin.maskin_id === 'WIS')?.objekt.map(x => x.namn)).toEqual(['a', 'b'])
  })
  it('kort maskin: flytta minsta objektet till maskin med luft som klarar typen', () => {
    const objekt = [o('stor', 'slutavverkning', 'SCORP', null, 12, null), o('liten', 'slutavverkning', 'SCORP', null, 8, null)]
    const bel = belaggning(objekt, maskiner, dagar, '2026-09-07', true)
    const tim = timmarForTyp(bel, 'slutavverkning')
    expect(tim.timmar).toBe(20)
    expect(tim.kapacitet).toBe(16)
    expect(tim.luft).toBe(-4)
    const a = atgardForTyp('slutavverkning', { planerat: 0, korrigerat: 0, antalObjekt: 0, justeringProcent: null, utanVolym: 0, utanBolag: 0, gap: 0, grans: 0, saknas: 0 }, tim, bel, 18, '/objekt', fmt)
    expect(a?.slag).toBe('flytta')
    expect(a?.text).toContain('liten')
    expect(a?.text).toContain('Rottne')
  })
  it('ingen maskin med luft → övertid i dagar, räcker inte → prata med bolaget', () => {
    const objekt = [o('x', 'slutavverkning', 'SCORP', null, 30, null), o('y', 'slutavverkning', 'R64428', null, 150, null)]
    const bel = belaggning(objekt, maskiner, dagar, '2026-09-07', true)
    const tim = timmarForTyp(bel, 'slutavverkning')
    const tomPlan = { planerat: 0, korrigerat: 0, antalObjekt: 0, justeringProcent: null, utanVolym: 0, utanBolag: 0, gap: 0, grans: 0, saknas: 0 }
    const a = atgardForTyp('slutavverkning', tomPlan, tim, bel, 18, '/objekt', fmt)
    expect(a?.slag).toBe('overtid')   // 20 h kort → 3 dagar ≤ 18 kvar
    const b = atgardForTyp('slutavverkning', tomPlan, tim, bel, 1, '/objekt', fmt)
    expect(b?.slag).toBe('prata')
  })
  it('saknas volym går före timmar; allt grönt → ingen åtgärd', () => {
    const bel = belaggning([], maskiner, dagar, '2026-09-07', true)
    const tim = timmarForTyp(bel, 'gallring')
    const plan = { planerat: 0, korrigerat: 0, antalObjekt: 0, justeringProcent: null, utanVolym: 0, utanBolag: 0, gap: 1000, grans: 100, saknas: 1000 }
    expect(atgardForTyp('gallring', plan, tim, bel, 18, '/objekt', fmt)?.slag).toBe('planera')
    expect(atgardForTyp('gallring', { ...plan, saknas: 0 }, tim, bel, 18, '/objekt', fmt)).toBeNull()
  })
})

describe('månadens tillstånd', () => {
  it('avslutad / pågående / kommande', () => {
    expect(manadStatus(2026, 8, '2026-09-07')).toBe('avslutad')
    expect(manadStatus(2026, 9, '2026-09-07')).toBe('pagaende')
    expect(manadStatus(2026, 10, '2026-09-07')).toBe('kommande')
  })
})
