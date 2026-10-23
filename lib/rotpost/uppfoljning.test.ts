import { describe, it, expect } from 'vitest'
import { rotposter, skillnad } from './uppfoljning'
import type { Objekt } from '@/lib/medelstam/berakna'

const obj = (id: string, ms: number, timmer: number, forsta = '2026-05-01', rot20: number | null = 0.3): Objekt => ({
  id, namn: `Trakt ${id}`, typ: 'Slutavverkning', forsta, stammar: 1000, volym: 1000,
  timmer, kubb: 150, massa: 800 - timmer, medelstam: ms, rot20, stammar20: 500, lov: 10,
})

// Fyra vanliga trakter kring 0,60 med 55 % timmer, en rotpost med 70 %.
const alla = [obj('a', 0.58, 550), obj('b', 0.6, 550), obj('c', 0.62, 550), obj('d', 0.61, 550),
  obj('rp', 0.6, 700, '2026-09-01', 0.45), obj('rp-ensam', 1.5, 700, '2026-03-01', null)]

describe('rotposter', () => {
  const r = rotposter(alla, new Set(['rp', 'rp-ensam']))

  it('bara markerade trakter, nyast först', () => {
    expect(r.map(x => x.id)).toEqual(['rp', 'rp-ensam'])
  })
  it('det vanliga räknas på ANDRA trakter, aldrig på trakten själv', () => {
    expect(r[0].jamfordaTrakter).toBe(4)
    expect(r[0].vanligt!.timmer).toBe(55)
    expect(r[0].andel.timmer).toBe(70)
    expect(skillnad(r[0], 'timmer')).toBe(15)
  })
  it('för få trakter i närheten: ingen jämförelse, aldrig noll', () => {
    expect(r[1].vanligt).toBeNull()
    expect(skillnad(r[1], 'timmer')).toBeNull()
  })
  it('kubik per sortiment summerar till volymen', () => {
    expect(Object.values(r[0].m3).reduce((a, b) => a + b, 0)).toBe(1000)
  })
  it('röta som den är mätt, null när den saknas', () => {
    expect(r[0].rota).toBe(0.45)
    expect(r[1].rota).toBeNull()
  })
})
