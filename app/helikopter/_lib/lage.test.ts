import { describe, it, expect } from 'vitest'
import { byggTavla, koerFor, type TavlaIndata } from './tavla'
import { barSvar, byggTidslinje, lageRutor, lageSvar, MIN_SKOTBART_M3 } from './lage'
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

  it('skotaren: Brokamåla (2 m³ fällt) väntar på skördaren — den tar de andra först och har ingen egen stapel före dem', () => {
    const ek = rad('EK26')
    expect(ek.barer.find(b => b.namn.startsWith('Brokamåla'))?.start ?? 1).toBeGreaterThan(0)
    expect(2).toBeLessThan(MIN_SKOTBART_M3)
  })

  it('skotarens kö räknar på det som är fällt och hinner fällas — inte på hela traktens 4 314 m³', () => {
    const { koer } = koerFor(indata())
    const brok = koer.get('EK26')!.find(r => r.trakt.namn?.startsWith('Brokamåla') ?? r.trakt.objekt_id === '7469112c-9247-4250-bf32-73d63a76e284')
    expect(brok).toBeDefined()
    expect(brok!.kvar).toBeLessThan(4314)
    expect(brok!.trakt.rest_volym).toBe(brok!.kvar)
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
    const lang = [...trakter.filter(x => x.objekt_id !== 'Britteberg'), trakt('Efter', 'skotare', 'EK26', { sortn: 2, volym: 100, rest_volym: 100, timmar: 5, prognos_h: 5 }), trakt('Efter', 'skordare', 'Scorpion', { volym: 100, utfort_volym: 100, timmar: 0 }), trakt('Lång', 'skotare', 'EK26', { sortn: 0.5, volym: 2000, rest_volym: 2000, timmar: 80, prognos_h: 80 }), trakt('Lång', 'skordare', 'Scorpion', { volym: 2000, utfort_volym: 2000, timmar: 0 })]
    // Maskinen är på trakten nu (senaste arbetet ligger där): bara då får den ett klar-datum.
    const d2 = indata({ klar: klar(maskiner, lang), senaste: [{ maskin_id: 'EK26', pa: ['Lång'] }] })
    const t2 = byggTidslinje(d2, byggTavla(d2))!
    const b = t2.rader.find(r => r.maskin_id === 'EK26')!.barer.find(x => x.namn.startsWith('Lång'))!
    expect(b.stil).toBe('efter')
    expect(b.fore).toBeGreaterThan(0)
    expect(b.fore).toBeLessThan(1)
    // Trakterna efter den står "därefter" — inget datum, för det förutsätter att maskinen hinner dit.
    const efter = t2.rader.find(r => r.maskin_id === 'EK26')!.barer.filter(x => x.namn.startsWith('Efter'))
    expect(efter.length).toBeGreaterThan(0)
    for (const x of efter) { expect(x.stil).toBe('darefter'); expect(barSvar(x, t2).klar).toBe('därefter') }
    // Kön står i körordning med volym kvar, och varje trakt säger om beställningen behöver den (eller null när det inte går att avgöra).
    const ko = t2.rader.find(r => r.maskin_id === 'EK26')!.ko!
    expect(ko.map(k => k.namn.startsWith('Lång'))[0]).toBe(true)
    expect(ko.every(k => k.kvar > 0 && (k.behovs == null || k.behovs >= 0))).toBe(true)
  })

  it('maskinen är inte på någon köad trakt (eller okänt var den är): första står "nästa", inget datum', () => {
    const med = [...trakter, trakt('Först', 'skotare', 'EK26', { sortn: 0.5, volym: 100, rest_volym: 100, timmar: 5, prognos_h: 5 }), trakt('Först', 'skordare', 'Scorpion', { volym: 100, utfort_volym: 100, timmar: 0 })]
    const d2 = indata({ klar: klar(maskiner, med), senaste: [{ maskin_id: 'EK26', pa: [], annat_oppet: false }] })
    const t2 = byggTidslinje(d2, byggTavla(d2))!
    const barer = t2.rader.find(r => r.maskin_id === 'EK26')!.barer
    expect(barer[0].namn.startsWith('Först')).toBe(true)
    expect(barer[0].stil).toBe('nasta')
    expect(barSvar(barer[0], t2).klar).toBe('nästa')
    const okant = byggTidslinje(indata({ senaste: undefined }), byggTavla(indata({ senaste: undefined })))!
    expect(okant.rader.flatMap(r => r.barer).every(x => x.stil === 'saknas' || x.stil === 'nasta' || x.stil === 'darefter')).toBe(true)
  })

  it('ingen tidslinje i en månad som inte pågår eller utan köunderlag', () => {
    expect(byggTidslinje(indata({ status: 'avslutad' }), byggTavla(indata()))).toBeNull()
    expect(byggTidslinje(indata({ klar: null }), byggTavla(indata()))).toBeNull()
  })
})

describe('barSvar — ord i stället för tidsaxel', () => {
  const t = { dagar: [{ dag: '24', vdag: 'tis' }, { dag: '25', vdag: 'ons' }, { dag: '26', vdag: 'tors' }], slut: 3, rader: [] }
  const bar = (start: number, langd: number, stil: 'klar' | 'efter' | 'saknas') => ({ id: 'x', namn: 'X', start, langd, stil, fore: 0, text: 'X' })
  it('klar inom månaden: dag och längd', () => {
    expect(barSvar(bar(0, 2, 'klar'), t)).toEqual({ langd: '2 dagar', klar: 'klar ons 25', ton: 'klar' })
    expect(barSvar(bar(0, 0.4, 'klar'), t).langd).toBe('under 1 dag')
  })
  it('efter månadens slut säger bara det', () => {
    expect(barSvar(bar(1, 5, 'efter'), t)).toEqual({ langd: '5 dagar', klar: 'klar efter månadens slut', ton: 'efter' })
  })
  it('prognos saknas: "tid saknas", ingen längd', () => {
    expect(barSvar(bar(0, 3, 'saknas'), t)).toEqual({ langd: '', klar: 'tid saknas', ton: 'saknas' })
  })
})
