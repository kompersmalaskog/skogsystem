import { describe, it, expect } from 'vitest'
import { sortimentFordelning, avvikelseMotProduktion, GRUPP_TILL_SORTIMENT } from './sortiment'

// Facit: Scorpion (PONS20SDJAA270231), oktober 2026 — fakt_sortiment grupperat via vy_sortiment_klass, uppmätt i prod 2026-10-21.
// 11 av sortimenten (228,6 m³) saknar rad i dim_sortiment_grupp men har sin grupp i vyn (filens produktgrupp).
const OKT: Array<[string, string, number]> = [
  ['S_tim1', 'Timmer', 1088.6], ['S_tim2', 'Timmer', 1006.2],
  ['S_massa', 'Massa', 816.6],
  ['S_kubb', 'Kubb', 358.7],
  ['S_energi', 'Energi', 123.1],
  ['S_hemved', 'Hemved', 80.4],
  ['S_osort', 'Utan sortiment', 4.2],
]
const rader = OKT.map(([id, , v]) => ({ sortiment_id: id, volym_m3sub: v }))
const gruppAv = new Map<string, string | null>(OKT.map(([id, g]) => [id, g]))

describe('sortimentFordelning — Scorpion oktober 2026', () => {
  const f = sortimentFordelning(rader, gruppAv)
  it('timmer 60, kubb 10, massaved 24, övrigt 6 — hela procent som summerar till 100', () => {
    expect(f.hela).toEqual({ timmer: 60, kubb: 10, massa: 24, ovrigt: 6 })
    expect(Object.values(f.hela).reduce((a, b) => a + b, 0)).toBe(100)
  })
  it('volymerna: övrigt = energi + hemved + osorterat; summan är hela m³-totalen', () => {
    expect(f.volym.timmer).toBeCloseTo(2094.8, 5)
    expect(f.volym.kubb).toBeCloseTo(358.7, 5)
    expect(f.volym.massa).toBeCloseTo(816.6, 5)
    expect(f.volym.ovrigt).toBeCloseTo(207.7, 5)
    expect(f.total).toBeCloseTo(3477.8, 5)
  })
  it('INGET är okänt: alla grupper i vyn känns igen och alla sortiment har en grupp', () => {
    expect(f.utanGrupp).toBe(0)
    expect(f.okandaGrupper).toEqual([])
  })
})

describe('grupper i prod täcks (vy_sortiment_klass.grupp, 2026-10-21)', () => {
  // Alla distinkta värden vyn gav för alla 300 sortiment: ingen får hamna i "okänd grupp".
  const GRUPPER_I_PROD = ['Timmer', 'Massa', 'Kubb', 'Energi', 'Hemved', 'Klentimmer', 'Utan sortiment', 'Övrigt']
  it.each(GRUPPER_I_PROD)('%s har en klass', g => {
    expect(GRUPP_TILL_SORTIMENT[g]).toBeDefined()
    const f = sortimentFordelning([{ sortiment_id: 'x', volym_m3sub: 10 }], new Map([['x', g]]))
    expect(f.okandaGrupper).toEqual([])
    expect(f.utanGrupp).toBe(0)
  })
  it('klentimmer räknas som kubb (går till såg som kubb), energi och hemved som övrigt', () => {
    expect(GRUPP_TILL_SORTIMENT.Klentimmer).toBe('kubb')
    expect(GRUPP_TILL_SORTIMENT.Energi).toBe('ovrigt')
    expect(GRUPP_TILL_SORTIMENT.Hemved).toBe('ovrigt')
  })
})

describe('det som är ogrupperat sägs — det göms aldrig', () => {
  it('ett sortiment utan grupp i vyn (NULL) ligger i Övrigt och räknas i utanGrupp', () => {
    const f = sortimentFordelning([{ sortiment_id: 'a', volym_m3sub: 6 }, { sortiment_id: 'b', volym_m3sub: 94 }], new Map([['a', null], ['b', 'Timmer']]))
    expect(f.volym.ovrigt).toBe(6)
    expect(f.utanGrupp).toBe(6)
    expect(f.hela).toEqual({ timmer: 94, kubb: 0, massa: 0, ovrigt: 6 })
  })
  it('ett sortiment som inte finns i vyn alls räknas likadant', () => {
    const f = sortimentFordelning([{ sortiment_id: 'finns_inte', volym_m3sub: 5 }, { sortiment_id: null, volym_m3sub: 1 }], new Map())
    expect(f.utanGrupp).toBe(6)
  })
  it('ett gruppnamn vi inte känner igen ligger i Övrigt och namnges', () => {
    const f = sortimentFordelning([{ sortiment_id: 'a', volym_m3sub: 10 }], new Map([['a', 'Nyfunnen grupp']]))
    expect(f.okandaGrupper).toEqual(['Nyfunnen grupp'])
    expect(f.volym.ovrigt).toBe(10)
    expect(f.utanGrupp).toBe(0)
  })
  it('null-volym och tom lista ger noll, inte NaN', () => {
    expect(sortimentFordelning([{ sortiment_id: 'a', volym_m3sub: null }], new Map([['a', 'Timmer']])).total).toBe(0)
    const tom = sortimentFordelning([], new Map())
    expect(tom.total).toBe(0)
    expect(tom.hela).toEqual({ timmer: 0, kubb: 0, massa: 0, ovrigt: 0 })
  })
})

describe('avvikelseMotProduktion', () => {
  it('Scorpion oktober: 3 477,7 mot 3 474,0 m³ är 0,1 % — inget skrivs', () => {
    expect(avvikelseMotProduktion(3477.7, 3474.0)).toBeNull()
  })
  it('från 1 % står det, med båda talen', () => {
    expect(avvikelseMotProduktion(3510, 3474)).toEqual({ sortiment: 3510, produktion: 3474 })
    expect(avvikelseMotProduktion(3460, 3474)).toBeNull()      // 0,4 %
  })
  it('utan produktionsvolym eller utan sortiment finns inget att jämföra', () => {
    expect(avvikelseMotProduktion(100, null)).toBeNull()
    expect(avvikelseMotProduktion(0, 100)).toBeNull()
  })
})
