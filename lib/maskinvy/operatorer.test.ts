import { describe, it, expect } from 'vitest'
import { slaIhopOperatorer, normaliseraNamn, type OperatorSumma } from './operatorer'

const op = (id: string, namn: string, g15h: number, volym: number, datum: string[], stammar = 0): OperatorSumma => ({
  id, namn, g15h, volym, stammar, dagar: datum.length, prod: g15h > 0 ? volym / g15h : null, datum,
})

describe('slaIhopOperatorer — en rad per person', () => {
  it('Max Karlsson: två operator_id → en rad, vägd produktivitet (aldrig snitt av 15,7 och 11,7)', () => {
    // 15,7 m³/G15h på 20 h (314 m³) och 11,7 på 60 h (702 m³)
    const rader = [
      op('A030353_1', 'Max Karlsson', 20, 314, ['2026-10-01', '2026-10-02']),
      op('A030353_3', 'Max Karlsson', 60, 702, ['2026-10-05', '2026-10-06', '2026-10-07']),
      op('A030353_2', 'Martin Lindqvist', 10, 150, ['2026-10-03']),
    ]
    const koppling = new Map([['A030353_1', 'med-max'], ['A030353_3', 'med-max'], ['A030353_2', 'med-martin']])
    const ut = slaIhopOperatorer(rader, koppling)
    expect(ut).toHaveLength(2)
    const max = ut.find(o => o.namn === 'Max Karlsson')!
    expect(max.volym).toBe(1016)
    expect(max.g15h).toBe(80)
    expect(max.dagar).toBe(5)
    expect(max.prod).toBeCloseTo(12.7, 6)                  // 1016 / 80
    expect(max.prod).not.toBeCloseTo((15.7 + 11.7) / 2, 1) // 13,7 vore snitt av snitt
    expect(max.ids).toEqual(['A030353_1', 'A030353_3'])
  })

  it('en dag där båda id:n arbetat räknas en gång', () => {
    const ut = slaIhopOperatorer(
      [op('a', 'Max Karlsson', 10, 100, ['2026-10-01', '2026-10-02']), op('b', 'Max Karlsson', 10, 100, ['2026-10-02', '2026-10-03'])],
      new Map([['a', 'm'], ['b', 'm']]),
    )
    expect(ut[0].dagar).toBe(3)
  })

  it('utan koppling: normaliserat namn slår ihop (stor/liten bokstav, extra mellanslag)', () => {
    const ut = slaIhopOperatorer([op('x', 'Max  Karlsson', 10, 100, []), op('y', 'max karlsson ', 5, 40, [])])
    expect(ut).toHaveLength(1)
    expect(ut[0].volym).toBe(140)
  })

  it('okopplat id med samma namn som ett kopplat hör till samma person', () => {
    const ut = slaIhopOperatorer(
      [op('a', 'Max Karlsson', 10, 100, []), op('nytt', 'Max Karlsson', 10, 100, [])],
      new Map([['a', 'm']]),
    )
    expect(ut).toHaveLength(1)
  })

  it('olika personer slås aldrig ihop; en ensam rad får ids', () => {
    const ut = slaIhopOperatorer(
      [op('a', 'Daniel Johansson', 10, 100, ['2026-10-01']), op('b', 'Max Karlsson', 10, 100, ['2026-10-01'])],
      new Map([['a', 'd'], ['b', 'm']]),
    )
    expect(ut.map(o => o.namn)).toEqual(['Daniel Johansson', 'Max Karlsson'])
    expect(ut[0].ids).toEqual(['a'])
  })

  it('g15h 0 efter ihopslagning → prod null, aldrig division', () => {
    const ut = slaIhopOperatorer([op('a', 'Z', 0, 5, []), op('b', 'Z', 0, 5, [])], new Map([['a', 'm'], ['b', 'm']]))
    expect(ut[0].prod).toBeNull()
  })

  it('stammar summeras (skördare)', () => {
    const ut = slaIhopOperatorer([op('a', 'Z', 1, 5, [], 100), op('b', 'Z', 1, 5, [], 50)], new Map([['a', 'm'], ['b', 'm']]))
    expect(ut[0].stammar).toBe(150)
  })

  it('normaliseraNamn', () => {
    expect(normaliseraNamn('  Åsa   Öberg ')).toBe('åsa öberg')
    expect(normaliseraNamn(null)).toBe('')
  })
})
