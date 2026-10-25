import { describe, it, expect } from 'vitest'
import { fordelaVolym, medelstamTabell, SAKER_MIN_TRAKTER } from './tabell'
import { heltalTill100, utfall, type Objekt } from './berakna'

const obj = (id: string, medelstam: number, timmer: number, kubb: number, massa: number, ovrigt = 0): Objekt => ({
  id, namn: id, typ: 'Slutavverkning', forsta: '2026-01-01', stammar: 1000, volym: timmer + kubb + massa + ovrigt,
  timmer, kubb, massa, medelstam, rot20: null, stammar20: null, lov: 0,
})

// Fem trakter kring 0,50, två kring 0,25, inga kring 0,80.
const alla: Objekt[] = [
  obj('a', 0.48, 500, 200, 250, 50), obj('b', 0.5, 560, 180, 220, 40), obj('c', 0.52, 520, 190, 240, 50),
  obj('d', 0.47, 480, 210, 260, 50), obj('e', 0.53, 600, 160, 200, 40),
  obj('f', 0.25, 280, 240, 340, 140), obj('g', 0.26, 300, 230, 330, 140),
]

describe('fordelaVolym', () => {
  it('summerar alltid till den avrundade volymen', () => {
    for (const v of [1, 7, 800, 1234.6, 2999]) {
      const r = fordelaVolym(v, { timmer: 54.3, kubb: 18.2, massa: 25.1, ovrigt: 2.4 })
      expect(Object.values(r).reduce((a, b) => a + b, 0)).toBe(Math.round(v))
    }
  })
  it('800 m³ med 54/18/25/3 ger 432/144/200/24', () => {
    expect(fordelaVolym(800, { timmer: 54, kubb: 18, massa: 25, ovrigt: 3 })).toEqual({ timmer: 432, kubb: 144, massa: 200, ovrigt: 24 })
  })
})

describe('medelstamTabell', () => {
  const rader = medelstamTabell(alla, {}, false, null, [0.25, 0.5, 0.8])

  it('ger SAMMA procent som medelstamssidans utfall() vid samma medelstam', () => {
    const u = utfall(alla, 0.5)
    expect(rader[1].procent).toEqual(heltalTill100(u.andel!))
    expect(rader[1].n).toBe(u.n)
  })
  it('under tre trakter: inga tal, aldrig noll', () => {
    expect(rader[0]).toMatchObject({ n: 2, forFa: true, procent: null, m3: null })
    expect(rader[2]).toMatchObject({ n: 0, forFa: true, procent: null })
  })
  it('tre till fem trakter märks osäkert', () => {
    expect(rader[1].n).toBeLessThan(SAKER_MIN_TRAKTER)
    expect(rader[1].osaker).toBe(true)
  })
  it('med volym blir det kubik som summerar till volymen', () => {
    const [, r] = medelstamTabell(alla, {}, false, 800, [0.25, 0.5])
    expect(Object.values(r.m3!).reduce((a, b) => a + b, 0)).toBe(800)
  })
  it('procenten summerar till 100', () => {
    expect(Object.values(rader[1].procent!).reduce((a, b) => a + b, 0)).toBe(100)
  })
})
