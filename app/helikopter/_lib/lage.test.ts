import { describe, it, expect } from 'vitest'
import { byggTavla, type TavlaIndata } from './tavla'
import { byggTidslinje, lageRutor, lageSvar, MIN_SKOTBART_M3 } from './lage'
import type { KlarData, KlarMaskin, KlarTrakt } from './klar'
import type { SparLage } from './berakningar'

// November 2026, 23 nov: fem arbetsdagar kvar (24–27 och 30 nov), sedan december. Trakterna är de i produktion den dagen (förenklade).
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

// g15 8 h/dag: Bondeskog 16 h = 2 dagar, Lidhem Britteberg 24 h = 3 dagar, Aramo 20 h = 2,5 dagar.
const maskiner = [maskin('Scorpion', 'skordare'), maskin('EK26', 'skotare'), maskin('Wisent', 'skotare'), maskin('810E', 'skotare')]
const trakter: KlarTrakt[] = [
  // Brokamåla: 4 314 m³, 2 m³ fällt. Skördaren behöver bara en del; skotaren har inget att köra.
  trakt('Brokamåla', 'skordare', 'Scorpion', { volym: 4314, utfort_volym: 2, timmar: 160, prognos_h: 160 }),
  trakt('Brokamåla', 'skotare', 'EK26', { volym: 4314, rest_volym: 4314, timmar: 195, prognos_h: 195 }),
  trakt('Bondeskog', 'skordare', 'Scorpion', { volym: 610, utfort_volym: 578, timmar: 0 }),
  trakt('Bondeskog', 'skotare', 'EK26', { volym: 610, rest_volym: 395, utfort_volym: 215, timmar: 16, prognos_h: 28 }),
  trakt('Britteberg', 'skordare', 'Scorpion', { volym: 631, utfort_volym: 631, timmar: 0 }),
  trakt('Britteberg', 'skotare', 'EK26', { volym: 631, rest_volym: 631, timmar: 24, prognos_h: 24 }),
  trakt('Lidhem', 'skordare', 'Scorpion', { volym: 1359, utfort_volym: 1411, timmar: 0 }),
  trakt('Lidhem', 'skotare', 'EK26', { volym: 1359, rest_volym: 1359, timmar: null, prognos_h: null, saknar_prognos: true }),
  trakt('Aramo', 'skordare', 'Scorpion', { volym: 336, utfort_volym: 352, timmar: 0 }),
  trakt('Aramo', 'skotare', 'Wisent', { volym: 336, rest_volym: 336, timmar: 20, prognos_h: 20 }),
  trakt('Tröjemåla', 'skordare', 'Scorpion', { volym: 321, utfort_volym: 378, timmar: 0 }),
  trakt('Tröjemåla', 'skotare', '810E', { volym: 321, rest_volym: 321, timmar: null, prognos_h: null, saknar_prognos: true }),
]
const indata = (x: Partial<TavlaIndata> = {}): TavlaIndata => ({
  status: 'pagaende', spar: [spar('slutavverkning', { skordat: 4780, skotat: 2750 })], utfall: [], klar: klar(maskiner, trakter), egna: new Set(), ...x,
})

describe('lageSvar — EN mening', () => {
  it('skotningen fattas: "Vi hinner inte allt. Skotningen fattas." med talet i förklaringen', () => {
    const d = indata()
    const s = lageSvar(byggTavla(d), 'pagaende')
    expect(s.avvikelse).toBe(true)
    expect(s.rad1).toBe('Vi hinner inte allt.')
    expect(s.rad2).toMatch(/^Skot(ningen|ning och skördning) fattas\.$/)
    expect(s.under).toMatch(/^Fattas: slutavverkning .* m³ skotning/)
  })
  it('ingen beställning, avslutad och klar säger det', () => {
    expect(lageSvar(byggTavla(indata({ spar: [] })), 'pagaende').rad1).toBe('Ingen beställning inlagd')
  })
})

describe('lageRutor — fyra rutor mot beställningen', () => {
  const d = indata({ spar: [spar('slutavverkning', { skordat: 4780, skotat: 2750 }), spar('gallring', { bestallt: 1000, skordat: 627, skotat: 627 })] })
  const rutor = lageRutor(byggTavla(d))
  it('en ruta per spår och roll, "n av beställt" och ett ord', () => {
    expect(rutor).toHaveLength(4)
    for (const r of rutor) { expect(r.rad).toMatch(/ av /); expect(['Hinner', 'Fattas', 'Klar', 'Över']).toContain(r.ord) }
  })
  it('Fattas har talet i ord och aldrig ett negativt tal', () => {
    for (const r of rutor.filter(r => r.ord === 'Fattas')) expect(r.tal).toMatch(/^(ca )?[\d\s]+ m³$/)
  })
})

describe('byggTidslinje — vem gör vad, dag för dag', () => {
  const d = indata()
  const t = byggTidslinje(d, byggTavla(d))!
  const rad = (id: string) => t.rader.find(r => r.maskin_id === id)!

  it('tio dagar framåt, månadens slut efter fem', () => {
    expect(t.dagar).toHaveLength(10)
    expect(t.slut).toBe(5)
    expect(t.dagar[0]).toEqual({ dag: '24', vdag: 'tis' })
    expect(t.dagar[5].dag).toBe('1 dec')
  })

  it('skotaren: längden räknas på det som är fällt — Brokamåla (2 m³ fällt) ritas inte som 25 dagar utan väntar på skördaren', () => {
    const ek = rad('EK26')
    expect(ek.barer.find(b => b.namn.startsWith('Brokamåla'))).toBeUndefined()
    expect(ek.not).toMatch(/Brokamåla väntar på skördaren/)
    expect(2).toBeLessThan(MIN_SKOTBART_M3)
  })

  it('Bondeskog: fällt 363 av kvar 395 → 2 dagar × 363/395; följande trakt börjar där den slutar', () => {
    const ek = rad('EK26')
    const [a, b] = ek.barer
    expect(a.namn).toMatch(/Bondeskog/)
    expect(a.start).toBe(0)
    expect(a.langd).toBeCloseTo(2 * (363 / 395), 5)
    expect(b.start).toBeCloseTo(a.langd, 5)
  })

  it('trakt utan prognos är en streckad stapel "tid saknas" och allt efter den står i ord — ingen påhittad längd', () => {
    const tr = rad('810E').barer[0]
    expect(tr.stil).toBe('saknas')
    expect(tr.text).toMatch(/tid saknas/)
    const ek = rad('EK26')
    expect(ek.barer.at(-1)!.stil).toBe('saknas')
  })

  it('en stapel som korsar månadens slut är "efter", med den del som ligger före linjen', () => {
    // Ekonomin: Bondeskog (1,8 d) + Britteberg (3 d) = 4,8 d → klar före slut (5); lägg en längre trakt.
    const lang = [...trakter.filter(x => x.objekt_id !== 'Britteberg'), trakt('Lång', 'skotare', 'EK26', { sortn: 1.5, volym: 2000, rest_volym: 2000, timmar: 80, prognos_h: 80 }), trakt('Lång', 'skordare', 'Scorpion', { volym: 2000, utfort_volym: 2000, timmar: 0 })]
    const d2 = indata({ klar: klar(maskiner, lang) })
    const t2 = byggTidslinje(d2, byggTavla(d2))!
    const b = t2.rader.find(r => r.maskin_id === 'EK26')!.barer.find(x => x.namn.startsWith('Lång'))!
    expect(b.stil).toBe('efter')
    expect(b.fore).toBeGreaterThan(0)
    expect(b.fore).toBeLessThan(1)
  })

  it('ingen tidslinje i en månad som inte pågår eller utan köunderlag', () => {
    expect(byggTidslinje(indata({ status: 'avslutad' }), byggTavla(indata()))).toBeNull()
    expect(byggTidslinje(indata({ klar: null }), byggTavla(indata()))).toBeNull()
  })
})
