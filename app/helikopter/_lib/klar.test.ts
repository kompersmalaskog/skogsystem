import { describe, expect, it } from 'vitest'
import { fmt, fmtDag } from './format'
import fixtur from './__fixtures__/klar_2026-10-17.json'
import fixtur11 from './__fixtures__/klar_2026-11_fran_2026-10-17.json'
import {
  bastaFlytt, dagarSaknas, flyttText, klarSvar, lasKlar, maskinHoger, maskinUnderrad, medFoljandePrognos, otilldelade, raknaAlla, raknaMaskin, valForTrakt,
  type KlarData, type KlarMaskin, type KlarTrakt,
} from './klar'

// Fixturen är ett TRIMMAT svar ur prod: helikopter_ny_klar(2026, 10, '2026-10-17') (dagar kapade till 45 per maskin).
const prod = (): KlarData => lasKlar(structuredClone(fixtur))

const dagar = (start: string, antal: number): string[] => {
  const ut: string[] = []
  const d = new Date(`${start}T12:00:00Z`)
  while (ut.length < antal) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) ut.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return ut
}

const maskin = (o: Partial<KlarMaskin> & { maskin_id: string }): KlarMaskin => ({
  namn: o.maskin_id, roll: 'skotare', klarar_typ: 'bada', manuell: false, g15_per_dag: 8, ej_matt: false, takt: {},
  dagar: dagar('2026-11-02', 40), klar_datum: null, efter_manad: false, saknar_prognos: false, trakter: [], ...o,
})
const trakt = (o: Partial<KlarTrakt> & { objekt_id: string }): KlarTrakt => ({
  namn: o.objekt_id, typ: 'slutavverkning', roll: 'skotare', maskin_id: null, sortn: 1, ordning: 1, ar: 2026, manad: 11,
  forra_manaden: false, volym: 500, timmar: 16, rest_volym: 500, saknar_prognos: false, ur_ko: false, medelstam: null, prognos_h: 16, utfort_h: 0, utfort_volym: 0, ...o,
})
const data = (o: Partial<KlarData>): KlarData => ({
  ar: 2026, manad: 11, idag: '2026-10-17', start: '2026-11-02', sista_arbetsdag: '2026-11-30', har_bestallning: true,
  maskiner: [], trakter: [], spar: [], ...o,
})

describe('TS-räkningen = SQL-räkningen (fixtur ur prod)', () => {
  it('ger samma klar-datum och samma från–till per trakt som helikopter_ny_klar', () => {
    const d = prod()
    const planer = raknaAlla(d)
    for (const m of d.maskiner) {
      const p = planer[m.maskin_id]
      expect(p.klar, m.namn).toBe(m.klar_datum)
      expect(p.efterManad, m.namn).toBe(m.efter_manad)
      expect(p.saknar, m.namn).toBe(m.saknar_prognos)
      expect(p.rader.map(r => ({ objekt_id: r.trakt.objekt_id, fran: r.fran, till: r.till })), m.namn).toEqual(m.trakter)
    }
  })

  it('kommande månad (november, räknat 17 okt): samma datum som SQL, räknar från första arbetsdagen', () => {
    const d = lasKlar(structuredClone(fixtur11))
    expect(d.start).toBe('2026-11-01')
    const planer = raknaAlla(d)
    for (const m of d.maskiner) {
      expect(planer[m.maskin_id].klar, m.namn).toBe(m.klar_datum)
      expect(planer[m.maskin_id].rader.map(r => [r.fran, r.till]), m.namn).toEqual(m.trakter.map(t => [t.fran, t.till]))
    }
    expect(planer.PONS20SDJAA270231.klar).toBe('2026-11-12')
    expect(planer.A130743.klar).toBe('2026-11-19')
    expect(Object.values(planer).some(p => p.efterManad)).toBe(false)
    expect(klarSvar(d, { manadNamn: 'oktober', slutavverkning: 5000, gallring: 1000 })).toMatchObject({ rubrik: 'Beställning saknas', atgard: { slag: 'kopiera' } })
  })

  it('Giant klar 29 okt, Elefant 26 klar 12 nov (efter månaden), de andra utan trakt', () => {
    const planer = raknaAlla(prod())
    expect(planer.PONS20SDJAA270231.klar).toBe('2026-10-29')
    expect(planer.A130743.klar).toBe('2026-11-12')
    expect(planer.A130743.efterManad).toBe(true)
    expect(planer.R64428.klar).toBeNull()
    expect(maskinHoger(planer.R64428)).toEqual({ text: '–', ton: 'muted' })
  })

  it('trakter utan maskin räknas inte på någon maskin men försvinner inte', () => {
    const d = prod()
    expect(otilldelade(d).map(t => t.namn)).toContain('Mölleryd RP J-Hus -25')
    expect(otilldelade(d).length).toBe(9)
  })
})

describe('räkningen', () => {
  it('trakt n börjar på dag floor(före)+1 och slutar på dag ceil(efter)', () => {
    const m = maskin({ maskin_id: 'A', g15_per_dag: 8 })
    const p = raknaMaskin(m, [trakt({ objekt_id: 'a', sortn: 1, timmar: 12 }), trakt({ objekt_id: 'b', sortn: 2, timmar: 20 })], '2026-11-30')
    // a: 1,5 dag → dag 1–2; b: 2,5 dag → före 1,5 → dag 2, efter 4 → dag 4
    expect(p.rader.map(r => [r.fran, r.till])).toEqual([[m.dagar[0], m.dagar[1]], [m.dagar[1], m.dagar[3]]])
    expect(p.klar).toBe(m.dagar[3])
  })

  it('trakt utan prognos → maskinen har inget datum och visar "?"', () => {
    const m = maskin({ maskin_id: 'A' })
    const p = raknaMaskin(m, [trakt({ objekt_id: 'a', timmar: 16 }), trakt({ objekt_id: 'b', sortn: 2, timmar: null, saknar_prognos: true })], '2026-11-30')
    expect(p.saknar).toBe(true)
    expect(p.klar).toBeNull()
    expect(maskinHoger(p)).toEqual({ text: '?', ton: 'muted' })
  })

  it('klar efter månadens sista arbetsdag → orange datum', () => {
    const m = maskin({ maskin_id: 'A', dagar: dagar('2026-11-23', 30) })
    const p = raknaMaskin(m, [trakt({ objekt_id: 'a', timmar: 8 * 9 })], '2026-11-30')
    expect(p.efterManad).toBe(true)
    expect(maskinHoger(p).ton).toBe('orange')
    expect(dagarSaknas(p, '2026-11-30')).toBe(3)
  })

  it('kvarvarande timmar från förra månaden räknas med det som är kvar, inte hela prognosen', () => {
    const m = maskin({ maskin_id: 'A' })
    // prognosen 40 h, 28 h utförda → SQL ger timmar 12 → 1,5 dag
    const p = raknaMaskin(m, [trakt({ objekt_id: 'a', forra_manaden: true, timmar: 12 })], '2026-11-30')
    expect(p.rader[0].dagar).toBeCloseTo(1.5)
    expect(p.klar).toBe(m.dagar[1])
  })

  it('maskin med manuell datakälla (810E) räknar med snittakt mot kvarvarande volym', () => {
    const m = maskin({ maskin_id: 'JD', manuell: true, takt: { gallring: 50 } })
    const p = raknaMaskin(m, [trakt({ objekt_id: 'g', typ: 'gallring', rest_volym: 120, timmar: null, saknar_prognos: true })], '2026-11-30')
    expect(p.rader[0].dagar).toBeCloseTo(2.4)
    expect(p.klar).toBe(m.dagar[2])
    // ingen takt för slutavverkning → går inte att räkna, och maskinen erbjuds inte för en slutavverkning
    expect(raknaMaskin(m, [trakt({ objekt_id: 's', rest_volym: 120 })], '2026-11-30').saknar).toBe(true)
    const d = data({ maskiner: [m, maskin({ maskin_id: 'B' })], trakter: [trakt({ objekt_id: 's', maskin_id: 'B' })] })
    expect(valForTrakt(d, 's', 'skotare').map(r => r.maskin.maskin_id)).toEqual(['B'])
  })

  it('klar trakt (inget kvar) ligger inte i kön', () => {
    const m = maskin({ maskin_id: 'A' })
    const p = raknaMaskin(m, [trakt({ objekt_id: 'a', timmar: 0 })], '2026-11-30')
    expect(p.rader).toEqual([])
    expect(p.klar).toBeNull()
  })

  it('ordningen följer sortn (inte inkommande ordning)', () => {
    const m = maskin({ maskin_id: 'A' })
    const p = raknaMaskin(m, [trakt({ objekt_id: 'b', sortn: 2, timmar: 8 }), trakt({ objekt_id: 'a', sortn: 1, timmar: 8 })], '2026-11-30')
    expect(p.rader.map(r => r.trakt.objekt_id)).toEqual(['a', 'b'])
  })

  it('underrad: högst tre trakter, sedan +N', () => {
    const m = maskin({ maskin_id: 'A' })
    const ts = ['a', 'b', 'c', 'd', 'e'].map((id, i) => trakt({ objekt_id: id, namn: `Trakt${id}`, sortn: i + 1, timmar: 8 }))
    expect(maskinUnderrad(raknaMaskin(m, ts, '2026-11-30'))).toBe('Trakta, Traktb, Traktc +2')
  })
})

describe('flytt-förslag och byt maskin', () => {
  // Två skotare: S1 har två trakter och blir sen, S2 är ledig.
  const upplagg = (): KlarData => {
    const s1 = maskin({ maskin_id: 'S1', namn: 'Elefant 26', dagar: dagar('2026-11-02', 40) })
    const s2 = maskin({ maskin_id: 'S2', namn: 'Wisent', dagar: dagar('2026-11-02', 40) })
    return data({
      maskiner: [s1, s2],
      trakter: [
        trakt({ objekt_id: 'a', namn: 'Hästhagen', sortn: 1, maskin_id: 'S1', timmar: 8 * 12 }),
        trakt({ objekt_id: 'v', namn: 'Vällust 2026', sortn: 2, maskin_id: 'S1', timmar: 8 * 12 }),
      ],
    })
  }

  it('S1 blir sen (24 dagar), förslaget pekar på den lediga och datumet = arkets siffra för samma val', () => {
    const d = upplagg()
    const nu = raknaAlla(d)
    expect(nu.S1.efterManad).toBe(true)
    const f = bastaFlytt(d)!
    expect(f).toMatchObject({ objekt_id: 'v', till: { maskin_id: 'S2' }, iTid: true })
    const ark = valForTrakt(d, 'v', 'skotare')
    const s2 = ark.find(r => r.maskin.maskin_id === 'S2')!
    expect(s2.klar).toBe(d.maskiner[1].dagar[11])
    expect(ark.find(r => r.maskin.maskin_id === 'S1')!.nuvarande).toBe(true)
    // alla klara = det senaste av de två nya datumen
    const efter = raknaAlla(d, { objekt_id: 'v', roll: 'skotare', maskin_id: 'S2' })
    expect(f.nyttKlar).toBe([efter.S1.klar!, efter.S2.klar!].sort().pop())
    expect(flyttText(f)).toBe(`Flytta Vällust-skotningen till Wisenten → alla klara ${fmtDag(f.nyttKlar)}`)
  })

  it('en flytt som gör en maskin som räckte sen föreslås inte', () => {
    const d = upplagg()
    d.maskiner[1].dagar = dagar('2026-11-23', 40) // S2 har bara 6 dagar kvar i november
    // S2 skulle få 12 dagar → sen → ingen flytt hjälper utan att göra den sen
    d.trakter[1].timmar = 8 * 12
    expect(raknaAlla(d).S2.efterManad).toBe(false)
    expect(bastaFlytt(d)).toBeNull()
    const svar = klarSvar(d, null)
    expect(svar.avvikelse).toBe(true)
    expect(svar.rad).toMatch(/dagar saknas$/)
  })

  it('"N dagar saknas" när ingen flytt räcker', () => {
    const s1 = maskin({ maskin_id: 'S1', namn: 'Elefant 26', dagar: dagar('2026-11-02', 40) })
    const d = data({ maskiner: [s1], trakter: [trakt({ objekt_id: 'a', maskin_id: 'S1', timmar: 8 * 23 })] })
    expect(klarSvar(d, null)).toMatchObject({ rubrik: expect.stringMatching(/^Elefanten blir klar \d+ december$/), rad: '2 dagar saknas', avvikelse: true })
  })

  it('maskin som klarar fel typ erbjuds inte', () => {
    const d = upplagg()
    d.maskiner[1].klarar_typ = 'gallring'
    expect(valForTrakt(d, 'v', 'skotare').map(r => r.maskin.maskin_id)).toEqual(['S1'])
    expect(bastaFlytt(d)).toBeNull()
  })
})

describe('svarsraden (prioritet 1–5)', () => {
  const ok = (): KlarData => {
    const s = maskin({ maskin_id: 'S', namn: 'Giant', roll: 'skordare' })
    return data({
      maskiner: [s],
      trakter: [trakt({ objekt_id: 'a', roll: 'skordare', maskin_id: 'S', timmar: 8 * 5 })],
      spar: [{ typ: 'slutavverkning', bestallt: 500, trakt_volym: 500, trakter: [{ objekt_id: 'a', namn: 'A', volym: 500, saknar_prognos: false, forra_manaden: false }] }],
    })
  }

  it('1. ingen beställning → "Beställning saknas" med förra månadens siffror på knappen', () => {
    const d = { ...ok(), har_bestallning: false }
    expect(klarSvar(d, { manadNamn: 'oktober', slutavverkning: 5000, gallring: 1000 })).toMatchObject({
      rubrik: 'Beställning saknas', avvikelse: false, atgard: { slag: 'kopiera', text: `Samma som oktober · ${fmt(5000)} · ${fmt(1000)}` },
    })
    expect(klarSvar(d, null).atgard).toEqual({ slag: 'lagg_in', text: 'Lägg in beställning' })
  })

  it('2. trakt utan prognos: dämpad under 10 % av beställt, orange över; flera → antal', () => {
    const d = ok()
    d.spar[0].bestallt = 5000
    d.spar[0].trakter = [{ objekt_id: 'm', namn: 'Mölleryd RP -25', volym: 400, saknar_prognos: true, forra_manaden: false }]
    expect(klarSvar(d, null)).toMatchObject({ rubrik: 'Mölleryd RP saknar prognos', rad: 'Läggs i planeringsverktyget', avvikelse: false })
    d.spar[0].trakter[0].volym = 600
    expect(klarSvar(d, null).avvikelse).toBe(true)
    d.spar[0].trakter.push({ objekt_id: 'n', namn: 'N', volym: 10, saknar_prognos: true, forra_manaden: false })
    expect(klarSvar(d, null).rubrik).toBe('2 trakter saknar prognos')
  })

  it('4. trakter under beställt → "N m³fub saknar trakt"', () => {
    const d = ok()
    d.spar = [{ typ: 'gallring', bestallt: 1000, trakt_volym: 620, trakter: [] }]
    expect(klarSvar(d, null)).toMatchObject({ rubrik: 'Gallring: 380 m³fub saknar trakt', avvikelse: true })
  })

  it('5. allt ok → "November räcker" med datum per maskin', () => {
    const svar = klarSvar(ok(), null)
    expect(svar.rubrik).toBe('November räcker')
    expect(svar.avvikelse).toBe(false)
    expect(svar.rad).toMatch(/^Giant \d+ nov$/)
  })

  it('fixturen (oktober): fem trakter saknar prognos', () => {
    const svar = klarSvar(prod(), null)
    expect(svar.rubrik).toBe('5 trakter saknar prognos')
  })
})

describe('medFoljandePrognos — prognosen följer trakten', () => {
  const m = maskin({ maskin_id: 'M', roll: 'skordare' })
  it('för lite utfört: orört (prognosen gäller)', () => {
    const d = data({ maskiner: [m], trakter: [trakt({ objekt_id: 'a', roll: 'skordare', maskin_id: 'M', volym: 1000, prognos_h: 40, timmar: 38, utfort_h: 2, utfort_volym: 50 })] })
    const t = medFoljandePrognos(d).trakter[0]
    expect(t.timmar).toBe(38)
    expect(t.foljer).toBeUndefined()
  })
  it('går fortare än prognosen: resten krymper och trakten märks foljer', () => {
    // 8 tim och 400 m³ (50 m³/tim mot prognosens 25): viktat 37,5 → kvar 600/37,5 = 16 (prognosen rakt av: 32)
    const d = data({ maskiner: [m], trakter: [trakt({ objekt_id: 'a', roll: 'skordare', maskin_id: 'M', volym: 1000, prognos_h: 40, timmar: 32, utfort_h: 8, utfort_volym: 400 })] })
    const t = medFoljandePrognos(d).trakter[0]
    expect(t.timmar).toBe(16)
    expect(t.foljer).toEqual({ restPlanH: 32, skillnad: 1, utfortH: 8 })
    expect(t.saknar_prognos).toBe(false)
  })
  it('manuell maskin (810E) och GROT rörs inte', () => {
    const man = maskin({ maskin_id: 'JD', manuell: true })
    const d = data({ maskiner: [man, m], trakter: [
      trakt({ objekt_id: 'a', maskin_id: 'JD', volym: 1000, prognos_h: 40, timmar: 32, utfort_h: 8, utfort_volym: 400 }),
      trakt({ objekt_id: 'b', typ: 'grot', maskin_id: 'M', roll: 'skordare', volym: 1000, prognos_h: 40, timmar: 32, utfort_h: 8, utfort_volym: 400 }),
    ] })
    expect(medFoljandePrognos(d).trakter.map(t => t.timmar)).toEqual([32, 32])
  })
  it('utan prognos men med utfall: resten på den uppmätta takten, inget saknas längre', () => {
    const d = data({ maskiner: [m], trakter: [trakt({ objekt_id: 'a', roll: 'skordare', maskin_id: 'M', volym: 1000, prognos_h: null, timmar: null, saknar_prognos: true, utfort_h: 10, utfort_volym: 300 })] })
    const t = medFoljandePrognos(d).trakter[0]
    expect(t.timmar).toBeCloseTo(23.33, 2)
    expect(t.saknar_prognos).toBe(false)
    expect(raknaAlla(medFoljandePrognos(d)).M.saknar).toBe(false)
  })
  it('fixturen ur prod (äldre RPC utan utfört) ändras inte alls', () => {
    const d = prod()
    expect(medFoljandePrognos(d)).toEqual(d)
  })
})

describe('lasKlar', () => {
  it('ett tomt eller trasigt svar är ett fel, aldrig "inga trakter"', () => {
    expect(() => lasKlar(null)).toThrow()
    expect(() => lasKlar({})).toThrow()
    const trasig = structuredClone(fixtur) as any
    trasig.trakter[0].sortn = 'x'
    expect(() => lasKlar(trasig)).toThrow(/sortn/)
  })
})
