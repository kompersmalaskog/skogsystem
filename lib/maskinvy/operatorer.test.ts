import { describe, it, expect } from 'vitest'
import { slaIhopOperatorer, normaliseraNamn, APP_OPERATOR_PREFIX, type OperatorSumma } from './operatorer'

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

describe('slaIhopOperatorer — appens lass (syntetiskt app:-id) och kvot per G15-timme', () => {
  const perDag = (o: OperatorSumma, volym: Record<string, number>, g15Sek: Record<string, number>): OperatorSumma => ({ ...o, volymPerDag: volym, g15SekPerDag: g15Sek })

  it('Daniel: Opti-operatören och appens medarbetare blir EN rad — och namnet är Opti-namnet, inte appens förnamn (id som sorterar efter "app:")', () => {
    const opti = perDag(op('R64428_1', 'Daniel Fransson', 10, 40, ['2026-11-02']), { '2026-11-02': 40 }, { '2026-11-02': 36000 })
    const app = perDag(op(`${APP_OPERATOR_PREFIX}med-daniel`, 'Daniel', 0, 240, ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']),
      { '2026-11-23': 60, '2026-11-24': 60, '2026-11-25': 60, '2026-11-26': 60 }, {})
    const koppling = new Map([['R64428_1', 'med-daniel'], [`${APP_OPERATOR_PREFIX}med-daniel`, 'med-daniel']])
    const ut = slaIhopOperatorer([app, opti], koppling)          // appens rad först i listan: namnet ska ändå vara Opti-namnet
    expect(ut).toHaveLength(1)
    expect(ut[0].namn).toBe('Daniel Fransson')
    expect(ut[0].volym).toBe(280)
    expect(ut[0].dagar).toBe(5)
    expect(ut[0].ids).toEqual(['R64428_1', `${APP_OPERATOR_PREFIX}med-daniel`])
  })

  it('m³/G15h räknas bara på volym från dagar med G15-tid: 40 m³ / 10 h = 4,0 — inte 280 / 10 = 28', () => {
    const opti = perDag(op('A130743_1', 'Daniel Fransson', 10, 40, ['2026-11-02']), { '2026-11-02': 40 }, { '2026-11-02': 36000 })
    const app = perDag(op(`${APP_OPERATOR_PREFIX}m`, 'Daniel', 0, 240, ['2026-11-23']), { '2026-11-23': 240 }, {})
    const ut = slaIhopOperatorer([opti, app], new Map([['A130743_1', 'm'], [`${APP_OPERATOR_PREFIX}m`, 'm']]))
    expect(ut[0].prod).toBe(4)
  })

  it('en dag där både Opti och appen har lass och tid: dagens volym och tid adderas dag för dag', () => {
    const a = perDag(op('o', 'Max', 5, 50, ['d1']), { d1: 50 }, { d1: 18000 })
    const b = perDag(op(`${APP_OPERATOR_PREFIX}m`, 'Max', 0, 30, ['d1']), { d1: 30 }, {})
    const ut = slaIhopOperatorer([a, b], new Map([['o', 'm'], [`${APP_OPERATOR_PREFIX}m`, 'm']]))
    expect(ut[0].volymPerDag).toEqual({ d1: 80 })
    expect(ut[0].prod).toBe(16)         // 80 m³ / 5 h: dagen har tid, så hela dagens volym räknas
  })

  it('finns inga per-dag-kartor (äldre anropare) gäller den gamla uträkningen volym / G15h', () => {
    const ut = slaIhopOperatorer([op('a', 'Max', 10, 100, []), op('b', 'Max', 10, 100, [])], new Map([['a', 'm'], ['b', 'm']]))
    expect(ut[0].prod).toBe(10)
  })

  it('en person med bara appens lass (ingen Opti-operatör): en rad utan produktivitet — aldrig ett påhittat tal', () => {
    const app = perDag(op(`${APP_OPERATOR_PREFIX}x`, 'Oscar', 0, 100, ['d1']), { d1: 100 }, {})
    const ut = slaIhopOperatorer([app], new Map())
    expect(ut).toHaveLength(1)
    expect(ut[0].prod).toBeNull()
  })
})
