import { describe, it, expect } from 'vitest'
import { byggTavla, type TavlaIndata } from './tavla'
import { byggForslag, byggPrognos, traktTakt } from './prognos'
import type { KlarData, KlarMaskin, KlarTrakt } from './klar'
import type { SparLage } from './berakningar'

// Samma lilla november som tavla.test.ts: 10 arbetsdagar kvar, sista arbetsdagen 27 nov.
const DAGAR = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27',
  '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11']
const SISTA = '2026-11-27'
const maskin = (id: string, roll: 'skordare' | 'skotare', x: Partial<KlarMaskin> = {}): KlarMaskin => ({
  maskin_id: id, namn: id, roll, klarar_typ: 'bada', manuell: false, g15_per_dag: 8, ej_matt: false, takt: {}, dagar: DAGAR,
  klar_datum: null, efter_manad: false, saknar_prognos: false, trakter: [], ...x,
})
let n = 0
const trakt = (namn: string, roll: 'skordare' | 'skotare', maskin_id: string | null, x: Partial<KlarTrakt> = {}): KlarTrakt => ({
  objekt_id: namn, namn, typ: 'slutavverkning', roll, maskin_id, ur_ko: false, medelstam: null, sortn: ++n, ordning: null, ar: 2026, manad: 11,
  forra_manaden: false, volym: 400, timmar: 16, rest_volym: roll === 'skotare' ? 400 : null, saknar_prognos: false, prognos_h: 16, utfort_h: 0, utfort_volym: 0, ...x,
})
const spar = (x: Partial<SparLage>): SparLage => ({
  typ: 'slutavverkning', bestallt: 1000, bolag: [], skordat: 0, skotat: 0, oskotat: 0, ingaendeOskotat: 0, oskotatObjekt: [], taktSkordat: null, taktSkotat: null, taktDagar: 5,
  harPrognos: true, plan: 0, lage: null, behovPerDag: null, behovPerDagSkordat: null, prognosSkordat: null, prognosSkotat: null, klartDatumSkotat: null,
  klartDatumSkordat: null, oskotatStatus: null, oskotatForandring: null, skordareDagarFore: null, maskinIds: [], ...x,
})
const klar = (maskiner: KlarMaskin[], trakter: KlarTrakt[]): KlarData => ({
  ar: 2026, manad: 11, idag: '2026-11-16', start: '2026-11-16', sista_arbetsdag: SISTA, har_bestallning: true, maskiner, trakter, spar: [],
})

describe('prognos', () => {
  // Elefant: A tar 8 dagar (hinns), B 4 dagar (2 av 4 hinns → delvis), C 2 dagar (efter månaden). Krokshult har ingen maskin.
  const maskiner = [maskin('Elefant', 'skotare')]
  const trakter = [
    trakt('A', 'skotare', 'Elefant', { rest_volym: 300, timmar: 64 }),
    trakt('B', 'skotare', 'Elefant', { rest_volym: 200, timmar: 32 }),
    trakt('C', 'skotare', 'Elefant', { rest_volym: 100, timmar: 16 }),
    trakt('Krokshult', 'skotare', null, { rest_volym: 221, timmar: 16 }),
  ]
  const ind = (x: Partial<TavlaIndata> = {}): TavlaIndata => ({
    status: 'pagaende', spar: [spar({ bestallt: 1000, skordat: 700, skotat: 200 })],
    utfall: [{ typ: 'slutavverkning', maskin_id: 'Elefant', roll: 'skotare', volym: 200 }], klar: klar(maskiner, trakter), egna: new Set(), ...x,
  })
  const prog = (x: Partial<TavlaIndata> = {}) => { const d = ind(x); return byggPrognos(d, byggTavla(d)) }
  const skot = (x: Partial<TavlaIndata> = {}) => prog(x).spar[0].roller[1]

  it('hinns · hinns delvis · hinns inte · ingen maskin, i den ordningen, med månadens slut efter det som hinns', () => {
    const r = skot()
    expect(r.trakter.map(t => [t.namn, t.status])).toEqual([['A', 'hinns'], ['B', 'delvis'], ['C', 'hinns_inte'], ['Krokshult', 'ingen_maskin']])
    expect(r.linjeEfter).toBe(2)
    expect([r.hinns, r.delvis, r.hinnsInte]).toEqual([1, 1, 2])
    expect(prog().slutDatum).toBe('27 nov')
  })
  it('en delvis trakt hinner kvar × andel, och maskinens "hinner" är samma tal som tavlans landar − nu', () => {
    const r = skot()
    expect(r.trakter[1]).toMatchObject({ kvar: 200, hinner: 100, andel: 0.5 })
    const t = byggTavla(ind()).spar[0].block[1].maskiner[0]
    const m = prog().maskiner[0]
    expect(m.hinner).toBe((t.landar ?? 0) - t.nu)
    expect(m.hinner).toBe(r.trakter.reduce((a, x) => a + x.hinner, 0))
  })
  it('m³/G15h = kvar / kvarvarande timmar; saknas timmar är det null, aldrig 0', () => {
    expect(traktTakt(300, 64)).toBe(4.7)
    expect(traktTakt(300, null)).toBeNull()
    expect(traktTakt(300, 0)).toBeNull()
    expect(traktTakt(0, 10)).toBeNull()
    expect(skot().trakter[0].takt).toBe(4.7)
  })
  it('en maskin som kör annat lägger ingenting: trakterna hinns inte och maskinen är märkt', () => {
    const d = ind({ senaste: [{ maskin_id: 'Elefant', pa: [] }] })
    const p = byggPrognos(d, byggTavla(d))
    expect(p.spar[0].roller[1].trakter.filter(t => t.maskin_id === 'Elefant').every(t => t.status === 'hinns_inte' && t.hinner === 0 && t.korAnnat)).toBe(true)
    expect(p.maskiner[0]).toMatchObject({ korAnnat: true, hinner: 0 })
  })
  it('trakterna räcker inte: saknas = beställt − gjort − kvar', () => {
    expect(skot().saknar).toBe(null)
    expect(skot({ spar: [spar({ bestallt: 2000, skordat: 700, skotat: 200 })] }).saknar).toBeGreaterThan(0)
  })
  it('avslutad eller oläst månad: ingen linje, inget slutdatum', () => {
    expect(prog({ status: 'avslutad' }).slutDatum).toBe('')
    expect(prog({ klar: null }).spar[0].roller[1].linjeEfter).toBe(-1)
  })
  it('ett spår utan beställning visas inte', () => {
    expect(prog({ spar: [spar({ bestallt: 0 })] }).spar).toEqual([])
  })
})

describe('vad ska vi göra (förslag)', () => {
  // Giant skördar 400 m³; skotarna Elefant (egen kö: A 300) och Wisent. Krokshult (221) har ingen skotare. Beställt 1000, skotat 200 → fattas.
  const maskiner = [maskin('Elefant', 'skotare'), maskin('Wisent', 'skotare')]
  const trakter = [
    trakt('A', 'skotare', 'Elefant', { rest_volym: 300, timmar: 40 }),
    trakt('B', 'skotare', 'Wisent', { rest_volym: 300, timmar: 40 }),
    trakt('Krokshult', 'skotare', null, { rest_volym: 221, timmar: 16 }),
  ]
  const ind = (x: Partial<TavlaIndata> = {}): TavlaIndata => ({
    status: 'pagaende', spar: [spar({ bestallt: 1000, skordat: 700, skotat: 200 })],
    utfall: [{ typ: 'slutavverkning', maskin_id: 'Elefant', roll: 'skotare', volym: 200 }], klar: klar(maskiner, trakter), egna: new Set(), ...x,
  })
  const f = (x: Partial<TavlaIndata> = {}) => { const d = ind(x); return byggForslag(d, byggTavla(d)) }

  it('en trakt utan maskin: förslaget säger vilken maskin, och efter-talet är bättre än före-talet', () => {
    const k = f().find(x => x.id.startsWith('maskin:'))!
    expect(k).toBeDefined()
    expect(k.titel).toMatch(/^Ge Krokshult till (Elefant|Wisent)$/)
    expect(k.aktion).toEqual({ slag: 'maskin', objekt_id: 'Krokshult' })
    expect(k.vinst).toBeGreaterThan(0)
    expect(k.efter).not.toBe(k.fore)
  })
  it('maskin som kör annat: vinsten är det vi får tillbaka när hon räknas in', () => {
    const k = f({ senaste: [{ maskin_id: 'Wisent', pa: [] }, { maskin_id: 'Elefant', pa: ['A'] }] }).find(x => x.id.startsWith('kor:'))!
    expect(k.titel).toBe('Wisent tillbaka på sina trakter')
    expect(k.vinst).toBeGreaterThan(0)
  })
  it('störst vinst först, och "ny trakt" (ingen siffra) sist', () => {
    const l = f({ spar: [spar({ bestallt: 5000, skordat: 700, skotat: 200 })] }).filter(x => x.roll === 'skotare')
    const v = l.filter(x => x.vinst != null).map(x => x.vinst!)
    expect(v).toEqual([...v].sort((a, b) => b - a))
    expect(l[l.length - 1].id.startsWith('ny:')).toBe(true)
    expect(l[l.length - 1].vinst).toBeNull()
  })
  it('för mycket skördat: förslaget är att flytta en trakt till nästa månad', () => {
    const utfall: TavlaIndata['utfall'] = [{ typ: 'slutavverkning', maskin_id: 'Giant', roll: 'skordare', volym: 1500 }, { typ: 'slutavverkning', maskin_id: 'Elefant', roll: 'skotare', volym: 200 }]
    const k = f({ spar: [spar({ bestallt: 1000, skordat: 1500, skotat: 200 })], utfall }).find(x => x.roll === 'skordare')!
    expect(k).toMatchObject({ titel: 'Flytta en trakt till nästa månad', aktion: { slag: 'planera' } })
  })
  it('hinner vi eller månaden är slut: inga förslag', () => {
    const utfall: TavlaIndata['utfall'] = [{ typ: 'slutavverkning', maskin_id: 'Elefant', roll: 'skotare', volym: 200 }, { typ: 'slutavverkning', maskin_id: 'Giant', roll: 'skordare', volym: 100 }]
    expect(f({ spar: [spar({ bestallt: 100, skordat: 100, skotat: 200 })], utfall })).toEqual([])
    expect(f({ status: 'avslutad' })).toEqual([])
    expect(f({ klar: null })).toEqual([])
  })
})
