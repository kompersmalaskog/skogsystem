// Månadsfacit — reglerna (procent, klart_datum, skotat_fran_tidigare), läsningen av payloaden, vymodellen och notistexten.
// Fixturer: september 2026 och historiken per 2026-10-15, båda ur prod (helikopter_manadsfacit / helikopter_historik, pg_temp-kopia av migrationen).
// De dagliga skotningssummorna för klart_datum är hämtade ur helikopter_ny_dag — en annan väg än facit-funktionens egen — så att testet
// jämför SQL:ens klart_datum mot en oberoende räkning.
import { describe, it, expect } from 'vitest'
import facitSep from './__fixtures__/manadsfacit_2026-09.json'
import historikOkt from './__fixtures__/historik_2026-10-15.json'
import {
  facitModell, formateraManadNotis, historikModell, inomMarginal, klartDatum, klartText, lasHistorik, lasManadsfacit, manadNotisLank,
  procent, procentTon, radDampad, skotatFranTidigare, skotatTon, stapelSkala, tidigareText, type FacitSpar,
} from './manadsfacit'

const n = (x: number) => x.toLocaleString('sv-SE')

// Skotat per dag i september 2026 (m³fub, avrundat), bolag Vida — ur helikopter_ny_dag.
const dag = (lista: [number, number][]) => lista.map(([d, volym]) => ({ datum: `2026-09-${String(d).padStart(2, '0')}`, volym }))
const SLUT_DAGAR = dag([[1, 147], [2, 88], [4, 110], [7, 126], [8, 562], [9, 179], [10, 114], [11, 254], [14, 64], [15, 240], [16, 247], [17, 225], [18, 421], [19, 190], [20, 79], [21, 714], [22, 89], [23, 196], [24, 96], [25, 152], [26, 198], [27, 80], [28, 163], [29, 180], [30, 231]])
const GALL_DAGAR = dag([[1, 42], [2, 34], [3, 56], [4, 89], [7, 74], [8, 203], [9, 59], [11, 73], [14, 67], [15, 309], [16, 55], [17, 59], [22, 273]])

describe('procent', () => {
  it('skotat mot beställt, hela procent — talen ur september', () => {
    expect(procent(6532, 6000)).toBe(109)
    expect(procent(5142, 5000)).toBe(103)
    expect(procent(1390, 1000)).toBe(139)
  })
  it('halvt procent avrundas uppåt, som SQL round()', () => {
    expect(procent(1005, 1000)).toBe(101)
    expect(procent(994, 1000)).toBe(99)
  })
  it('noll skotat är 0 %, ingen beställning är null (aldrig 0 %)', () => {
    expect(procent(0, 1000)).toBe(0)
    expect(procent(500, 0)).toBeNull()
  })
  it('stämmer med SQL-svaret i fixturen, spår för spår och totalt', () => {
    const f = lasManadsfacit(facitSep)
    for (const typ of ['slutavverkning', 'gallring'] as const) {
      const s = f.spar[typ]!
      expect(procent(s.skotat, s.bestallt)).toBe(s.procent)
    }
    const t = f.totalt!
    expect(procent(t.skotat, t.bestallt)).toBe(t.procent)
    // Totalen är summan av de avrundade spåren — inte en egen avrundning.
    expect(f.spar.slutavverkning!.skotat + f.spar.gallring!.skotat).toBe(t.skotat)
    expect(f.spar.slutavverkning!.skordat + f.spar.gallring!.skordat).toBe(t.skordat)
    expect(f.spar.slutavverkning!.bestallt + f.spar.gallring!.bestallt).toBe(t.bestallt)
  })
})

describe('klartDatum', () => {
  it('första dagen då ackumulerat skotat nådde beställt — samma som SQL för september', () => {
    const f = lasManadsfacit(facitSep)
    expect(klartDatum(SLUT_DAGAR, 5000)).toBe('2026-09-30')
    expect(klartDatum(GALL_DAGAR, 1000)).toBe('2026-09-15')
    expect(klartDatum(SLUT_DAGAR, 5000)).toBe(f.spar.slutavverkning!.klart_datum)
    expect(klartDatum(GALL_DAGAR, 1000)).toBe(f.spar.gallring!.klart_datum)
  })
  it('dagsummorna i testen (avrundade per dag) summerar till spårets skotat ± avrundningen', () => {
    // Facit avrundar summan, inte varje dag — därför ± en halv m³ per dag.
    expect(Math.abs(SLUT_DAGAR.reduce((s, d) => s + d.volym, 0) - 5142)).toBeLessThanOrEqual(SLUT_DAGAR.length / 2)
    expect(Math.abs(GALL_DAGAR.reduce((s, d) => s + d.volym, 0) - 1390)).toBeLessThanOrEqual(GALL_DAGAR.length / 2)
  })
  it('exakt beställt räknas som nått', () => {
    expect(klartDatum(dag([[1, 400], [2, 600]]), 1000)).toBe('2026-09-02')
  })
  it('nåddes inte → null; ingen beställning → null', () => {
    expect(klartDatum(dag([[1, 400], [2, 599]]), 1000)).toBeNull()
    expect(klartDatum(dag([[1, 400]]), 0)).toBeNull()
    expect(klartDatum([], 1000)).toBeNull()
  })
  it('oordnad indata ger samma svar (ackumuleras i datumordning)', () => {
    expect(klartDatum([...SLUT_DAGAR].reverse(), 5000)).toBe('2026-09-30')
  })
})

describe('skotatFranTidigare', () => {
  const lass = [
    { volym: 100, skordning_avslutad: '2026-08-20' },
    { volym: 50, skordning_avslutad: '2026-08-31' },
    { volym: 30, skordning_avslutad: '2026-09-01' }, // avslutad PÅ månadens första dag = inte före
    { volym: 20, skordning_avslutad: '2026-09-15' },
    { volym: 10, skordning_avslutad: null }, // inget skördningsdatum: räknas inte hit
    { volym: 5, skordning_avslutad: '2026-07-03T10:00:00Z' },
  ]
  it('bara objekt vars skördning avslutades före månaden', () => {
    expect(skotatFranTidigare(lass, '2026-09-01')).toBe(155)
  })
  it('månaden före: bara det som avslutades dessförinnan', () => {
    expect(skotatFranTidigare(lass, '2026-08-01')).toBe(5)
  })
  it('inga lass → 0', () => {
    expect(skotatFranTidigare([], '2026-09-01')).toBe(0)
  })
  it('fixturen: 2 835 slutavverkning och 976 gallring skotades i september från augusti', () => {
    const f = lasManadsfacit(facitSep)
    expect(f.spar.slutavverkning!.skotat_fran_tidigare).toBe(2835)
    expect(f.spar.gallring!.skotat_fran_tidigare).toBe(976)
    expect(f.spar.slutavverkning!.tidigare_manader).toEqual([{ ar: 2026, manad: 8, volym: 2835 }])
  })
})

describe('klartText', () => {
  const spar = (x: Partial<FacitSpar>): FacitSpar => ({ ...lasManadsfacit(facitSep).spar.slutavverkning!, ...x })
  it('klart + volym från tidigare månad', () => {
    expect(klartText(spar({}), 'avslutad')).toBe(`Klart 30 sep · ${n(2835)} skotat från augusti`)
  })
  it('andra delen bara om volymen är > 0', () => {
    expect(klartText(spar({ skotat_fran_tidigare: 0, tidigare_manader: [] }), 'avslutad')).toBe('Klart 30 sep')
  })
  it('flera tidigare månader → "tidigare månader"', () => {
    const t = [{ ar: 2026, manad: 8, volym: 100 }, { ar: 2026, manad: 7, volym: 50 }]
    expect(klartText(spar({ skotat_fran_tidigare: 150, tidigare_manader: t }), 'avslutad')).toBe('Klart 30 sep · 150 skotat från tidigare månader')
    expect(tidigareText(t)).toBe('tidigare månader')
  })
  it('inte nått beställt: avslutad "Inte klart", pågående "Inte klart än"', () => {
    const s = spar({ klart_datum: null, skotat_fran_tidigare: 0, tidigare_manader: [] })
    expect(klartText(s, 'avslutad')).toBe('Inte klart')
    expect(klartText(s, 'pagaende')).toBe('Inte klart än')
  })
})

describe('färger (som Läge och Veckor)', () => {
  it('stora talet: grön från 100 %, orange under 95 %, text däremellan', () => {
    expect(procentTon(109)).toBe('gron')
    expect(procentTon(100)).toBe('gron')
    expect(procentTon(99)).toBe('neutral')
    expect(procentTon(95)).toBe('neutral')
    expect(procentTon(94)).toBe('orange')
    expect(procentTon(4)).toBe('orange')
  })
  it('skotat-mätaren: grön när skotat nått beställt, annars orange', () => {
    expect(skotatTon(5000, 5000)).toBe('gron')
    expect(skotatTon(5142, 5000)).toBe('gron')
    expect(skotatTon(4999, 5000)).toBe('orange')
  })
  it('september 2026: allt grönt — och modellen bär tonerna', () => {
    const m = facitModell(lasManadsfacit(facitSep))!
    expect(m.procentTon).toBe('gron')
    expect(m.spar.map(s => s.skotatTon)).toEqual(['gron', 'gron'])
  })
  it('en månad under beställt: orange tal och orange mätare', () => {
    const f = lasManadsfacit(facitSep)
    const sp = f.spar.slutavverkning!
    const under = facitModell({ ...f, spar: { ...f.spar, slutavverkning: { ...sp, skotat: 2000, procent: 40 } }, totalt: { ...f.totalt!, skotat: 3390, procent: 57 } })!
    expect(under.procentTon).toBe('orange')
    expect(under.spar[0].skotatTon).toBe('orange')
    expect(under.spar[1].skotatTon).toBe('gron')
  })
  it('veckans plan är summan av spårens plan (Veckor-färgen räknas mot den); utan plan null', () => {
    const m = facitModell(lasManadsfacit(facitSep))!
    expect(m.veckor[0].plan).toBe(909 + 182)
    expect(m.veckor[1].plan).toBe(1136 + 227)
    const f = lasManadsfacit(facitSep)
    const utanPlan = (s: FacitSpar): FacitSpar => ({ ...s, veckor: s.veckor.map(v => ({ ...v, plan: null })) })
    const x = facitModell({ ...f, spar: { slutavverkning: utanPlan(f.spar.slutavverkning!), gallring: utanPlan(f.spar.gallring!) } })!
    expect(x.veckor.every(v => v.plan === null)).toBe(true)
  })
})

describe('lasManadsfacit', () => {
  it('läser prod-svaret', () => {
    const f = lasManadsfacit(facitSep)
    expect(f.status).toBe('avslutad')
    expect(f.totalt).toEqual({ bestallt: 6000, skordat: 5918, skotat: 6532, procent: 109, maskiner: 5, arbetsdagar: 22 })
    expect(f.spar.slutavverkning!.veckor).toHaveLength(5)
  })
  it('spår utan beställning är null, inte 0', () => {
    const f = lasManadsfacit({ ar: 2026, manad: 5, status: 'avslutad', spar: { slutavverkning: null, gallring: null }, totalt: null })
    expect(f.spar.gallring).toBeNull()
    expect(f.totalt).toBeNull()
    expect(facitModell(f)).toBeNull()
  })
  it('ett svar som inte är ett facit är ett fel — aldrig 0 %', () => {
    expect(() => lasManadsfacit(null)).toThrow()
    expect(() => lasManadsfacit({})).toThrow()
    expect(() => lasManadsfacit({ ar: 2026, manad: 9, spar: { slutavverkning: { bestallt: null } }, totalt: null })).toThrow()
    expect(() => lasHistorik({})).toThrow()
  })
})

describe('facitModell — september 2026', () => {
  const m = facitModell(lasManadsfacit(facitSep))!
  it('svarsraden', () => {
    expect(m.rubrik).toBe('September 2026')
    expect(m.procentText).toBe('109 %')
    expect(m.levereratText).toBe(`Levererat ${n(6532)} av ${n(6000)} m³fub`)
    expect(m.bolagText).toBe('Vida')
  })
  it('ett kort per spår, slutavverkning först, med procent efter skotat', () => {
    expect(m.spar.map(s => s.namn)).toEqual(['Slutavverkning', 'Gallring'])
    const slut = m.spar[0]
    expect(slut.bestalltText).toBe(n(5000))
    expect(slut.skordatText).toBe(n(5170))
    expect(slut.skotatText).toBe(n(5142))
    expect(slut.skotatProcentText).toBe('103 %')
    expect(slut.klartText).toBe(`Klart 30 sep · ${n(2835)} skotat från augusti`)
    expect(m.spar[1].skotatProcentText).toBe('139 %')
    expect(m.spar[1].klartText).toBe(`Klart 15 sep · ${n(976)} skotat från augusti`)
  })
  it('mätarna är andel av beställt, kapade vid 100 %', () => {
    expect(m.spar[0].skordatAndel).toBeCloseTo(1, 5)
    expect(m.spar[0].skotatAndel).toBe(1)
    expect(m.spar[1].skordatAndel).toBeCloseTo(0.748, 3)
  })
  it('veckorna läggs ihop över spåren, vecka för vecka', () => {
    expect(m.veckor.map(v => v.etikett)).toEqual(['v36', 'v37', 'v38', 'v39', 'v40'])
    expect(m.veckor[0]).toMatchObject({ skordat: 1289 + 103, skotat: 345 + 220 })
    expect(m.veckor[4]).toMatchObject({ skordat: 402 + 150, skotat: 574 })
  })
  it('sidfoten', () => {
    expect(m.sidfot).toBe(`Skördat ${n(5918)} · skotat ${n(6532)} m³fub · 5 maskiner · 22 arbetsdagar`)
    expect(m.filnamn).toBe('manadsfacit-2026-09')
  })
  it('ett spår utan beställning visas inte som 0', () => {
    const f = lasManadsfacit(facitSep)
    const bara = facitModell({ ...f, spar: { slutavverkning: f.spar.slutavverkning, gallring: null } })!
    expect(bara.spar.map(s => s.namn)).toEqual(['Slutavverkning'])
  })
  it('singularis: en maskin, en arbetsdag', () => {
    const f = lasManadsfacit(facitSep)
    const x = facitModell({ ...f, totalt: { ...f.totalt!, maskiner: 1, arbetsdagar: 1 } })!
    expect(x.sidfot.endsWith('1 maskin · 1 arbetsdag')).toBe(true)
  })
})

describe('historikModell — prod 2026-10-15', () => {
  const h = lasHistorik(historikOkt)
  const m = historikModell(h)!
  it('svarsraden: snitt och hur många månader som ligger inom ±5 %', () => {
    expect(m.svar).toBe('51 %')
    expect(m.meta).toBe('snitt senaste 5 månader · 0 av 5 månader inom ±5 %')
  })
  it('staplarna äldst först, raderna nyast först', () => {
    expect(m.staplar.map(s => s.etikett)).toEqual(['apr', 'jun', 'jul', 'aug', 'sep'])
    expect(m.rader.map(r => r.rubrik)).toEqual(['September 2026', 'Augusti 2026', 'Juli 2026', 'Juni 2026', 'April 2026'])
    expect(m.rader[0].href).toBe('/helikopter/manad?ar=2026&manad=9')
  })
  it('rad under 95 % är dämpad, 95 och över i full text', () => {
    expect(m.rader.map(r => r.procentText)).toEqual(['109 %', '86 %', '20 %', '4 %', '37 %'])
    expect(m.rader.map(r => r.dampad)).toEqual([false, true, true, true, true])
    expect(radDampad(94)).toBe(true)
    expect(radDampad(95)).toBe(false)
  })
  it('stapeln är över när den når 100 %', () => {
    expect(m.staplar.map(s => s.over)).toEqual([false, false, false, false, true])
  })
  it('högst 12 staplar', () => {
    const manga = { ...h, manader: Array.from({ length: 14 }, (_, i) => ({ ...h.manader[0], ar: 2025, manad: (i % 12) + 1 })) }
    expect(historikModell(manga)!.staplar).toHaveLength(12)
  })
  it('ingen historik alls → null', () => {
    expect(historikModell({ manader: [], snitt_6m: null, antal_6m: 0, inom_5_6m: 0 })).toBeNull()
  })
  it('inom ±5 %', () => {
    expect(inomMarginal(95)).toBe(true)
    expect(inomMarginal(105)).toBe(true)
    expect(inomMarginal(94)).toBe(false)
    expect(inomMarginal(106)).toBe(false)
  })
  it('skalan är minst 100 %; 100-linjen ligger där procenten säger', () => {
    expect(stapelSkala([37, 86])).toEqual({ skala: 100, linje: 1 })
    const s = stapelSkala([109, 86])
    expect(s.skala).toBe(109)
    expect(s.linje).toBeCloseTo(100 / 109, 6)
  })
})

describe('månadsnotisen', () => {
  it('"Månadsfacit september: 109 %"', () => {
    expect(formateraManadNotis(facitSep)).toBe('Månadsfacit september: 109 %')
  })
  it('länkar till föregående månads facit', () => {
    expect(manadNotisLank(facitSep)).toBe('/helikopter/manad?ar=2026&manad=9')
  })
  it('ingen beställning: säger det, aldrig 0 %', () => {
    expect(formateraManadNotis({ ar: 2026, manad: 5, totalt: null })).toBe('Månadsfacit maj: ingen beställning')
  })
  it('trasig payload kraschar inte push-bygget', () => {
    expect(formateraManadNotis(null)).toBe('Månadsfacit')
    expect(manadNotisLank(null)).toBe('/helikopter?flik=historik')
  })
})
