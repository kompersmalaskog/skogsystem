import { describe, it, expect } from 'vitest'
import { byggTavla, type TavlaIndata } from './tavla'
import { byggTraktLista, traktRollOrd, MIN_SKOTBART_M3 } from './traktLista'
import type { KlarData, KlarMaskin, KlarTrakt } from './klar'
import type { SparLage } from './berakningar'

// November 2026, 23 nov: fem arbetsdagar kvar (24–27 och 30 nov). Trakterna och talen är de i produktion den dagen (förenklade).
const DAGAR = ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-07', '2026-12-08', '2026-12-09']
const SISTA = '2026-11-30'
const maskin = (id: string, roll: 'skordare' | 'skotare', x: Partial<KlarMaskin> = {}): KlarMaskin => ({
  maskin_id: id, namn: id, roll, klarar_typ: 'bada', manuell: false, g15_per_dag: 8, ej_matt: false, takt: {}, dagar: DAGAR,
  klar_datum: null, efter_manad: false, saknar_prognos: false, trakter: [], ...x,
})
let n = 0
const trakt = (namn: string, roll: 'skordare' | 'skotare', maskin_id: string | null, x: Partial<KlarTrakt> = {}): KlarTrakt => ({
  objekt_id: namn, namn, typ: 'slutavverkning', roll, maskin_id, ur_ko: false, medelstam: null, sortn: ++n, ordning: null, ar: 2026, manad: 11,
  forra_manaden: false, volym: 400, timmar: 16, rest_volym: roll === 'skotare' ? 400 : null, saknar_prognos: false, prognos_h: 16, utfort_h: 0, utfort_volym: 0, ...x,
})
const spar = (typ: 'slutavverkning' | 'gallring', x: Partial<SparLage>): SparLage => ({
  typ, bestallt: 5000, bolag: [], skordat: 0, skotat: 0, oskotat: 0, ingaendeOskotat: 0, oskotatObjekt: [], taktSkordat: null, taktSkotat: null, taktDagar: 5,
  harPrognos: true, plan: 0, lage: null, behovPerDag: null, behovPerDagSkordat: null, prognosSkordat: null, prognosSkotat: null, klartDatumSkotat: null,
  klartDatumSkordat: null, oskotatStatus: null, oskotatForandring: null, skordareDagarFore: null, maskinIds: [], ...x,
})
const klar = (maskiner: KlarMaskin[], trakter: KlarTrakt[]): KlarData => ({
  ar: 2026, manad: 11, idag: '2026-11-23', start: '2026-11-02', sista_arbetsdag: SISTA, har_bestallning: true, maskiner, trakter, spar: [],
})

const maskiner = [maskin('Scorpion', 'skordare'), maskin('R64428', 'skordare'), maskin('EK26', 'skotare'), maskin('Wisent', 'skotare')]
const trakter: KlarTrakt[] = [
  // Brokamåla: precis påbörjad (2 m³ fällt), ingen skotad — skotaren har inget att köra.
  trakt('Brokamåla', 'skordare', 'Scorpion', { volym: 4314, utfort_volym: 2, timmar: 160, prognos_h: 160 }),
  trakt('Brokamåla', 'skotare', 'EK26', { volym: 4314, rest_volym: 4314, timmar: 195, prognos_h: 195 }),
  // Bondeskog: fällt 578, skotat 215 → 363 att skota.
  trakt('Bondeskog', 'skordare', 'Scorpion', { volym: 610, utfort_volym: 578, timmar: 0 }),
  trakt('Bondeskog', 'skotare', 'EK26', { volym: 610, rest_volym: 395, utfort_volym: 215, timmar: 16, prognos_h: 28 }),
  // Lidhem Bondagård: ingen prognos för skotaren.
  trakt('Lidhem', 'skordare', 'Scorpion', { volym: 1411, utfort_volym: 1411, timmar: 0 }),
  trakt('Lidhem', 'skotare', 'EK26', { volym: 1359, rest_volym: 1359, timmar: null, prognos_h: null, saknar_prognos: true }),
  // Aramo (Wisent): prognos finns.
  trakt('Aramo', 'skordare', 'Scorpion', { volym: 352, utfort_volym: 352, timmar: 0 }),
  trakt('Aramo', 'skotare', 'Wisent', { volym: 336, rest_volym: 336, timmar: 20, prognos_h: 20 }),
]
const indata = (egna: string[] = []): TavlaIndata => ({
  status: 'pagaende', spar: [spar('slutavverkning', { skordat: 4780, skotat: 2750 })], utfall: [], klar: klar(maskiner, trakter), egna: new Set(egna),
})

describe('traktLista — trakterna som ska köras', () => {
  const d = indata()
  const lista = byggTraktLista(byggTavla(d).spar[0], d.klar!.trakter)
  const rad = (id: string) => lista.rader.find(r => r.objekt_id === id)

  it('har en rad per trakt med skördare och skotare var för sig', () => {
    const r = rad('Bondeskog')!
    expect(r.skotare?.maskin).toBe('EK26')
    expect(r.skotare?.kvar).toBe(395)
  })

  it('skotbart nu = fällt − skotat; inget fällt än säger det i stället för ett klar-datum', () => {
    expect(rad('Bondeskog')!.skotare?.skotbart).toBe(363)
    const b = rad('Brokamåla')!.skotare!
    expect(b.skotbart).toBe(2)
    expect(b.skotbart!).toBeLessThan(MIN_SKOTBART_M3)
    expect(b.status).toBe('inget_skordat')
    expect(traktRollOrd(b)).toEqual({ ord: 'Inget fällt än att skota', ton: 'orange' })
  })

  it('en trakt utan prognos säger det, den göms aldrig och får inget påhittat datum', () => {
    const l = rad('Lidhem')!.skotare!
    expect(l.till).toBeNull()
    expect(l.status).toBe('prognos_saknas')
    expect(traktRollOrd(l).ord).toBe('Prognos saknas')
  })

  it('en trakt med prognos får Klar <datum>, och efter månadens slut säger det', () => {
    const a = rad('Aramo')!.skotare!
    expect(a.status).toMatch(/^(klar|efter)$/)
    expect(traktRollOrd({ ...a, status: 'klar', till: '26 nov' })).toEqual({ ord: 'Klar 26 nov', ton: 'gron' })
    expect(traktRollOrd({ ...a, status: 'efter', till: 'ca 3 dec' })).toEqual({ ord: 'Klar ca 3 dec · efter månadens slut', ton: 'orange' })
  })

  it('egen skotning: markägaren skotar, ingen "ingen skotare" och inget skotbart-tal', () => {
    const e = indata(['Bondeskog'])
    const l = byggTraktLista(byggTavla(e).spar[0], e.klar!.trakter)
    const s = l.rader.find(r => r.objekt_id === 'Bondeskog')!.skotare!
    expect(s.status).toBe('egen')
    expect(s.skotbart).toBeNull()
    expect(traktRollOrd(s)).toEqual({ ord: 'Markägaren skotar', ton: 'dampad' })
  })

  it('alla inlagda trakter står med, också de som tavlans körordning kallar "behövs inte" (Brokamåla täcker annars hela skotarens behov)', () => {
    expect(lista.rader.map(r => r.objekt_id).sort()).toEqual(['Aramo', 'Bondeskog', 'Brokamåla', 'Lidhem'])
  })

  it('raderna står i körordning (sortn)', () => {
    const ids = lista.rader.map(r => r.objekt_id)
    expect(ids.indexOf('Brokamåla')).toBeLessThan(ids.indexOf('Aramo'))
  })
})
