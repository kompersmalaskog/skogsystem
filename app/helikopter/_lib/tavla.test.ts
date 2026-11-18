import { describe, it, expect } from 'vitest'
import { EGEN_SKOTNING, byggTavla, dagarText, flyttVal, ko, kvarVolym, utanforBestallning, vidaMotMatt, type TavlaIndata } from './tavla'
import type { KlarData, KlarMaskin, KlarTrakt } from './klar'
import { fmt } from './format'
import type { SparLage } from './berakningar'

// November 2026 i liten skala: 10 arbetsdagar kvar (16–27 nov), sista arbetsdagen 27 nov.
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
const spar = (typ: 'slutavverkning' | 'gallring', x: Partial<SparLage>): SparLage => ({
  typ, bestallt: 1000, bolag: [], skordat: 0, skotat: 0, oskotat: 0, ingaendeOskotat: 0, oskotatObjekt: [], taktSkordat: null, taktSkotat: null, taktDagar: 5,
  harPrognos: true, plan: 0, lage: null, behovPerDag: null, behovPerDagSkordat: null, prognosSkordat: null, prognosSkotat: null, klartDatumSkotat: null,
  klartDatumSkordat: null, oskotatStatus: null, oskotatForandring: null, skordareDagarFore: null, maskinIds: [], ...x,
})
const klar = (maskiner: KlarMaskin[], trakter: KlarTrakt[]): KlarData => ({
  ar: 2026, manad: 11, idag: '2026-11-16', start: '2026-11-16', sista_arbetsdag: SISTA, har_bestallning: true, maskiner, trakter, spar: [],
})
const bas = (x: Partial<TavlaIndata>): TavlaIndata => ({ status: 'pagaende', spar: [], utfall: [], klar: null, egna: new Set(), ...x })

describe('kön', () => {
  it('en trakt som slutar efter månaden räknas med den del som hinns', () => {
    const m = maskin('Elefant', 'skotare')
    // 64 h = 8 dagar, sedan 32 h = 4 dagar: den andra hinner 2 av 4 dagar före 27 nov.
    const rader = ko(m, [trakt('A', 'skotare', 'Elefant', { timmar: 64 }), trakt('B', 'skotare', 'Elefant', { timmar: 32 })], SISTA, new Set())
    expect(rader.map(r => r.andelIManaden)).toEqual([1, 0.5])
    expect(rader.map(r => r.till)).toEqual(['2026-11-25', '2026-12-01'])
  })
  it('en trakt utan prognos tar noll dagar och göms inte', () => {
    const m = maskin('Wisent', 'skotare')
    const rader = ko(m, [trakt('GROT', 'skotare', 'Wisent', { typ: 'grot', timmar: null }), trakt('B', 'skotare', 'Wisent')], SISTA, new Set())
    expect(rader[0].dagar).toBeNull()
    expect(rader[0].till).toBeNull()
    expect(rader[1].fran).toBe('2026-11-16')
  })
  it('skördarens kvar = volym − skördat, skotarens = rest', () => {
    expect(kvarVolym(trakt('A', 'skordare', 'G', { volym: 336, utfort_volym: 90 }))).toBe(246)
    expect(kvarVolym(trakt('A', 'skotare', 'E', { rest_volym: 331 }))).toBe(331)
  })
})

describe('tavlan', () => {
  const maskiner = [maskin('Giant', 'skordare'), maskin('Elefant', 'skotare'), maskin('Wisent', 'skotare')]
  const trakter = [
    trakt('Aramo', 'skordare', 'Giant', { volym: 300, utfort_volym: 100, timmar: 8 }),
    trakt('Arvidstorp', 'skotare', 'Elefant', { rest_volym: 300, timmar: 40 }),
    trakt('Edestad', 'skotare', 'Elefant', { rest_volym: 600, timmar: 80 }),
    trakt('Krokshult', 'skotare', null, { rest_volym: 221, timmar: 16 }),
    trakt('Klipp', 'skotare', 'Wisent', { typ: 'grot', timmar: null, rest_volym: 75 }),
  ]
  const ind = bas({
    spar: [spar('slutavverkning', { bestallt: 1000, skordat: 700, skotat: 200, ingaendeOskotat: 150 })],
    utfall: [{ typ: 'slutavverkning', maskin_id: 'Giant', roll: 'skordare', volym: 700.4 }, { typ: 'slutavverkning', maskin_id: 'Elefant', roll: 'skotare', volym: 199.6 }],
    klar: klar(maskiner, trakter),
  })
  const t = byggTavla(ind)
  const [skordat, skotat] = t.spar[0].block

  it('landar = nu + det kön hinner i månaden, per trakt', () => {
    expect(skordat.maskiner[0]).toMatchObject({ namn: 'Giant', nu: 700, landar: 900 })
    // Elefant: Arvidstorp 5 dagar (300), Edestad 10 dagar varav 5 hinns (300) → 200 + 600.
    expect(skotat.maskiner[0]).toMatchObject({ namn: 'Elefant', nu: 200, landar: 800 })
  })
  it('summan är summan av raderna, och domen står mot beställt', () => {
    expect(skotat.landar).toBe(800)
    expect(skotat).toMatchObject({ ord: 'Fattas 200', ton: 'orange' })
    expect(skordat).toMatchObject({ ord: 'Fattas 100', ton: 'orange' })
    expect(t.svar).toEqual({ rubrik: 'Slutavverkning fattas 200', avvikelse: true })
  })
  it('trakt utan maskin står för sig och räknas inte in', () => {
    expect(skotat.utan).toEqual([{ objekt_id: 'Krokshult', roll: 'skotare', namn: 'Krokshult', volym: 221 }])
  })
  it('kvar i skogen = ingående + skördat − skotat', () => {
    expect(t.spar[0].kvarISkogen).toBe(650)
  })
  it('maskin med bara GROT står under övrigt', () => {
    expect(t.ovrigt.map(o => o.namn)).toEqual(['Wisent'])
    expect(t.ovrigt[0].trakter[0]).toMatchObject({ namn: 'GROT Klipp', klar: '?' })
  })
  it('flytta: varje val säger vad det ger, och nuvarande står först', () => {
    const v = flyttVal(ind, 'Edestad', 'skotare')!
    expect(v.val.map(x => [x.namn, x.nuvarande, x.ord])).toEqual([['Elefant', true, 'Fattas 200'], ['Wisent', false, 'Hinner'], ['Egen skotning', false, expect.any(String)]])
    // Wisent tar Edestad (10 dagar, GROT före tar noll): Elefant 200 + 300, Wisent 600 → 1 100; "ca" för att GROT saknar prognos.
    const efter = byggTavla({ ...ind, flytt: { objekt_id: 'Edestad', roll: 'skotare', maskin_id: 'Wisent' } })
    expect(efter.spar[0].block[1]).toMatchObject({ landar: 1100, ca: true })
  })
  it('trakt utan maskin kan ges en maskin', () => {
    const v = flyttVal(ind, 'Krokshult', 'skotare')!
    expect(v.val.every(x => !x.nuvarande)).toBe(true)
    expect(v.val.find(x => x.namn === 'Wisent')!.ord).toBe('Hinner')
  })
  it('skördaren långt över beställt sägs', () => {
    const over = byggTavla({ ...ind, spar: [spar('slutavverkning', { bestallt: 500, skordat: 700, skotat: 500 })], utfall: [{ typ: 'slutavverkning', maskin_id: 'Giant', roll: 'skordare', volym: 700 }, { typ: 'slutavverkning', maskin_id: 'Elefant', roll: 'skotare', volym: 500 }] })
    expect(over.spar[0].block[0]).toMatchObject({ ord: '400 över', ton: 'orange' })
    expect(over.svar.rubrik).toBe('Skördaren går 400 över på slutavverkning')
  })
})

describe('räcker trakterna', () => {
  const maskiner = [maskin('Giant', 'skordare'), maskin('R64428', 'skordare'), maskin('Elefant', 'skotare')]
  // November 2026 (prod 2026-11-18): Giant har 3 937 skördat och bara 687 kvar i sina tre trakter — beställt 5 000. Gallring: 287 skördat, ca 2 190 kvar inlagt mot 1 000.
  const trakter = [
    trakt('Krokshult', 'skordare', 'Giant', { volym: 221, utfort_volym: 2 }),
    trakt('Tröjemåla 1:115', 'skordare', 'Giant', { volym: 321 }),
    trakt('Tröjemåla', 'skordare', 'Giant', { volym: 145 }),
    trakt('Santhe', 'skordare', 'R64428', { typ: 'gallring', volym: 1620, utfort_volym: 249 }),
    trakt('Söftesmåla', 'skordare', 'R64428', { typ: 'gallring', volym: 259 }),
    trakt('Hönshylte', 'skordare', 'R64428', { typ: 'gallring', volym: 255 }),
    trakt('Edestad', 'skotare', 'Elefant', { rest_volym: 4000 }),
    trakt('Krokshult', 'skotare', null, { rest_volym: 221 }),
    trakt('Santhe', 'skotare', 'Elefant', { typ: 'gallring', rest_volym: 1620 }),
  ]
  const t = byggTavla(bas({
    spar: [spar('slutavverkning', { bestallt: 5000 }), spar('gallring', { bestallt: 1000 })],
    utfall: [
      { typ: 'slutavverkning', maskin_id: 'Giant', roll: 'skordare', volym: 3937 }, { typ: 'slutavverkning', maskin_id: 'Elefant', roll: 'skotare', volym: 1505 },
      { typ: 'gallring', maskin_id: 'R64428', roll: 'skordare', volym: 287 },
    ],
    klar: klar(maskiner, trakter),
  }))
  const rad = (typ: string, roll: string) => t.spar.find(s => s.typ === typ)!.racker.find(r => r.roll === roll)!

  it('slutavverkning skördat: skogen tar slut — saknar 378 mot beställt', () => {
    expect(rad('slutavverkning', 'skordare')).toMatchObject({ diff: -378, ord: `Saknar ${fmt(378)}`, ton: 'orange' })
  })
  it('gallring skördat: för mycket inlagt — räcker och mer därtill', () => {
    expect(rad('gallring', 'skordare')).toMatchObject({ ton: 'dampad' })
    expect(rad('gallring', 'skordare').ord).toBe(`${fmt(rad('gallring', 'skordare').diff)} för mycket`)
    expect(rad('gallring', 'skordare').diff).toBe(Math.round(287 + (1620 - 249) + 259 + 255 - 1000))
  })
  it('skotaren: skog nog, även den som saknar maskin räknas som skog att ta', () => {
    expect(rad('slutavverkning', 'skotare')).toMatchObject({ ord: 'Räcker', ton: 'gron' })
  })
  it('Vad kan du göra: saknas först, sedan trakter utan maskin, sist för mycket', () => {
    expect(t.gor.map(g => g.slag)).toEqual(['saknas', 'utan', 'formycket'])
    expect(t.gor[0]).toMatchObject({ text: 'Lägg in en ny trakt i slutavverkning', under: `Skördare saknar ${fmt(378)} m³` })
    expect(t.gor[1]).toMatchObject({ slag: 'utan', text: '1 trakt har ingen skotare' })
    expect(t.gor[2].text).toBe('Gallring har för mycket inlagt')
  })
  it('vilka trakter som behövs: de första i körordning som täcker behovet, resten kan vänta (gallring november)', () => {
    const b = rad('gallring', 'skordare').behov!
    // Behov = 1 000 − 287 = 713. Santhe (kvar 1 371) täcker allt; Söftesmåla och Hönshylte behövs inte.
    expect(b).toMatchObject({ bestallt: 1000, nu: 287, behov: 713, saknas: 0 })
    expect(b.behovs.map(x => [x.namn, x.behovs, x.kvar])).toEqual([['Santhe', 713, 1371]])
    expect(b.inte.map(x => x.namn).sort()).toEqual(['Hönshylte', 'Söftesmåla'])
    expect(b.inte.every(x => x.flyttbar)).toBe(true)
  })
  it('slutavverkning: alla tre behövs och det saknas ändå', () => {
    const b = rad('slutavverkning', 'skordare').behov!
    expect(b).toMatchObject({ behov: 1063, saknas: 378, inte: [] })
    expect(b.behovs.reduce((a, x) => a + x.kvar, 0)).toBe(685)
  })
  it('tid per trakt: maskinens dagar, delat efter hur mycket av trakten som behövs; saknad prognos är null, aldrig 0', () => {
    const b = rad('gallring', 'skordare').behov!
    // Varje trakt = 16 h på en maskin med 8 h/dag = 2 dagar. Santhe behövs till 713 av 1 371 → 2 × 713/1371.
    expect(b.behovs[0].dagar).toBeCloseTo(2 * 713 / 1371, 5)
    expect(b.dagarBehovs).toBeCloseTo(2 * 713 / 1371, 5)
    expect(b.inte.map(x => x.dagar)).toEqual([2, 2])
    const utanTid = byggTavla(bas({
      spar: [spar('gallring', { bestallt: 1000 })],
      utfall: [{ typ: 'gallring', maskin_id: 'R64428', roll: 'skordare', volym: 287 }],
      klar: klar(maskiner, [trakt('Santhe', 'skordare', 'R64428', { typ: 'gallring', volym: 1620, utfort_volym: 249, timmar: null })]),
    }))
    const nb = utanTid.spar[0].racker.find(r => r.roll === 'skordare')!.behov!
    expect(nb.behovs[0].dagar).toBeNull()
    expect(nb.dagarBehovs).toBeNull()
  })
  it('dagarText: alltid ca, och en halv dag är inte 0', () => {
    expect(dagarText(0.2)).toBe('under en halv dag')
    expect(dagarText(1)).toBe('ca 1 arbetsdag')
    expect(dagarText(8.6)).toBe('ca 9 arbetsdagar')
  })
  it('skotaren har ingen behovslista (trakten flyttas som helhet via skördaren)', () => {
    expect(rad('slutavverkning', 'skotare').behov).toBeNull()
  })
  it('en påbörjad trakt eller förra månadens går inte att flytta', () => {
    const t2 = byggTavla(bas({
      spar: [spar('gallring', { bestallt: 100 })],
      utfall: [{ typ: 'gallring', maskin_id: 'R64428', roll: 'skordare', volym: 100 }],
      klar: klar(maskiner, [
        trakt('Klar', 'skordare', 'R64428', { typ: 'gallring', volym: 50 }),
        trakt('Påbörjad', 'skordare', 'R64428', { typ: 'gallring', volym: 200, utfort_volym: 30 }),
        trakt('Förra', 'skordare', 'R64428', { typ: 'gallring', volym: 80, forra_manaden: true }),
        trakt('Ny', 'skordare', 'R64428', { typ: 'gallring', volym: 90 }),
      ]),
    }))
    const inte = t2.spar[0].racker.find(r => r.roll === 'skordare')!.behov!.inte
    expect(Object.fromEntries(inte.map(x => [x.namn, x.flyttbar]))).toEqual({ Klar: true, Påbörjad: false, Förra: false, Ny: true })
  })
  it('ingen rad i en avslutad månad, utan beställning eller utan köer', () => {
    const ind = bas({ spar: [spar('slutavverkning', { bestallt: 5000 })], utfall: [], klar: klar(maskiner, trakter) })
    expect(byggTavla({ ...ind, status: 'avslutad' }).spar[0].racker).toEqual([])
    expect(byggTavla({ ...ind, klar: null }).spar[0].racker).toEqual([])
    expect(byggTavla({ ...ind, spar: [spar('slutavverkning', { bestallt: 0 })] }).spar[0].racker).toEqual([])
    expect(byggTavla({ ...ind, klar: null }).gor).toEqual([])
  })
})

describe('egen skotning', () => {
  const maskiner = [maskin('H8E', 'skordare')]
  const trakter = [
    trakt('Santhe', 'skordare', 'H8E', { typ: 'gallring', volym: 1620, utfort_volym: 204, timmar: 40 }),
    trakt('Santhe', 'skotare', null, { typ: 'gallring', rest_volym: 1620, timmar: null }),
    trakt('Rimshult', 'skordare', 'H8E', { typ: 'gallring', volym: 45, timmar: 8 }),
  ]
  const ind = bas({
    // Spårets egna tal (SQL) räknar inte med egen skotning: 38 är Vashult, Santhes 204 kommer som egetSkordat.
    spar: [spar('gallring', { bestallt: 1000, skordat: 38 })],
    utfall: [{ typ: 'gallring', maskin_id: 'H8E', roll: 'skordare', volym: 38 }],
    egetSkordat: [{ typ: 'gallring', maskin_id: 'H8E', volym: 204 }],
    klar: klar(maskiner, trakter), egna: new Set(['Santhe']),
  })
  const t = byggTavla(ind)
  it('skördaren får med det hon fällt, och det hon hinner fälla, på egen skotning', () => {
    const m = t.spar[0].block[0].maskiner[0]
    expect(m.nu).toBe(242)
    expect(m.landar).toBeGreaterThan(242 + 45)
    expect(m.trakter.map(x => [x.namn, x.utanfor])).toEqual([['Santhe', false], ['Rimshult', false]])
    expect(t.spar[0].block[0].nu).toBe(242)
  })
  it('skotat: aldrig "ingen maskin" — en rad Markägaren skotar som räknas in i summan', () => {
    const b = t.spar[0].block[1]
    expect(b.utan).toEqual([])
    expect(b.markagare).toMatchObject({ nu: 204 })
    expect(b.markagare!.trakter.map(x => x.namn)).toEqual(['Santhe'])
    expect(b.nu).toBe(204)
    // Det markägaren landar på = det skördaren landar på där: summan går att räkna ihop.
    expect(b.landar).toBe(b.markagare!.landar)
    expect(b.markagare!.landar).toBe(t.spar[0].block[0].maskiner[0].landar! - 38 - 45)
  })
  it('valet Egen skotning finns för skotaren, och står först när det gäller', () => {
    const v = flyttVal(ind, 'Santhe', 'skotare')!
    expect(v.val[0]).toMatchObject({ maskin_id: EGEN_SKOTNING, namn: 'Egen skotning', nuvarande: true })
    expect(flyttVal(ind, 'Santhe', 'skordare')!.val.some(x => x.maskin_id === EGEN_SKOTNING)).toBe(false)
  })
})

describe('utan kö', () => {
  it('avslutad månad: bara utfallet, domen på det', () => {
    const t = byggTavla(bas({ status: 'avslutad', spar: [spar('slutavverkning', { bestallt: 1000, skordat: 1100, skotat: 950 })], utfall: [{ typ: 'slutavverkning', maskin_id: 'E', roll: 'skotare', volym: 950 }] }))
    expect(t.spar[0].block[1]).toMatchObject({ nu: 950, landar: null, ord: 'Fattades 50' })
    expect(t.svar.rubrik).toBe('Slutavverkning fattades 50')
  })
  it('utfall per maskin kunde inte läsas: spårets summa står kvar', () => {
    const t = byggTavla(bas({ utfall: null, spar: [spar('slutavverkning', { skordat: 700, skotat: 200 })] }))
    expect(t.spar[0].block.map(b => b.nu)).toEqual([700, 200])
  })
  it('ingen beställning', () => {
    expect(byggTavla(bas({ spar: [spar('gallring', { bestallt: 0 })] })).svar.rubrik).toBe('Ingen beställning inlagd')
  })
})

describe('utanforBestallning', () => {
  const spar = [{ typ: 'gallring' as const, bestallt: 1000, bolag: ['Vida'] }, { typ: 'slutavverkning' as const, bestallt: 0, bolag: [] }]
  const rad = (x: Partial<Parameters<typeof utanforBestallning>[0][number]>) => ({ maskin_id: 'H', roll: 'skordare' as const, objekt_id: 'o', namn: 'Trakt', typ: 'Gallring', bolag: 'Vida', egen_skotning: false, volym: 100, ...x })
  it('H8E november 2026: Vidas gallringar räknas (också egen skotning för skördaren), de privata står utanför', () => {
    const ut = utanforBestallning([
      rad({ namn: 'Gallring Santhe 2026.', egen_skotning: true, volym: 216 }),
      rad({ namn: 'Vashult gallring 2026', volym: 38 }),
      rad({ namn: 'Kjell-Erik Lindström Steglehylte', bolag: 'Privat', volym: 114 }),
      rad({ namn: 'Patrik Andersson Bjällerhult', bolag: 'Privat', egen_skotning: true, volym: 109 }),
      rad({ namn: 'Kompersmåla Ga Avd 210', bolag: 'Privat', volym: 47 }),
    ], spar)
    expect(ut.map(u => u.volym)).toEqual([114, 109, 47])
    expect(ut.reduce((a, u) => a + u.volym, 0)).toBe(270)
  })
  it('utan beställning räknas alla bolag; GROT, okänd typ och skotarens lass på egen skotning står utanför; noll visas inte', () => {
    expect(utanforBestallning([rad({ typ: 'Slutavverkning', bolag: 'Privat' })], spar)).toEqual([])
    expect(utanforBestallning([rad({ typ: 'Grot' }), rad({ typ: null }), rad({ roll: 'skotare', egen_skotning: true }), rad({ bolag: 'Privat', volym: 0.2 })], spar).length).toBe(3)
    expect(utanforBestallning([rad({ bolag: 'vida' })], spar)).toEqual([])
  })
})

describe('vidaMotMatt', () => {
  it('säger Vidas volym mot den uppmätta när de skiljer minst 5 %', () => {
    expect(vidaMotMatt({ total: 1240, vida: 1620, klar: false })).toBe(`Vida sa ${fmt(1620)} · ser ut att bli ${fmt(1240)}`)
    expect(vidaMotMatt({ total: 1240, vida: 1620, klar: true })).toBe(`Vida sa ${fmt(1620)} · blev ${fmt(1240)}`)
  })
  it('är tyst när de är nära, när Vidas volym saknas och utan mätning', () => {
    expect(vidaMotMatt({ total: 1670, vida: 1620, klar: false })).toBeNull()
    expect(vidaMotMatt({ total: 900, vida: null, klar: false })).toBeNull()
    expect(vidaMotMatt(undefined)).toBeNull()
  })
})
