import { describe, it, expect } from 'vitest'
import { raderUrLasning, jamforStampling, procentMot } from './stampling'
import type { Lasning } from '@/lib/stampling/pdf/rapport'
import type { Cell } from '@/lib/stampling/berakna'

const lasning: Lasning = {
  post: { namn: 'Bågskyttebanan', fastighet: null, agare: null, forrattare: 'Lars-Börje Nilsson', datum: '2025-03-26', total_volym_m3sk: 1884 },
  tradslag: [
    { namn: 'Tall', klasser: [{ diameter_cm: 30, antal: 10, volym_m3sk: 8 }, { diameter_cm: 40, antal: 5, volym_m3sk: 8 }], tryckt_antal: 15, tryckt_volym_m3sk: 16 },
    { namn: 'Gran', klasser: [{ diameter_cm: 30, antal: 4, volym_m3sk: 3 }], tryckt_antal: 4, tryckt_volym_m3sk: 3 },
    { namn: 'Torra', klasser: [{ diameter_cm: 26, antal: 1, volym_m3sk: 0.8 }], tryckt_antal: 1, tryckt_volym_m3sk: 1 },
  ],
  sammanfattning: [], osakerheter: [],
}

const cell = (slag: string, klass: number, m3: number, timmer: number): Cell =>
  ({ slag, klass, rot: 'alla', stammar: 500, objekt: 20, m3_per_stam: m3, timmer_pct: timmer, kubb_pct: 10, massa_pct: 90 - timmer, ovrigt_pct: 0 })
const celler = [cell('tall', 30, 1, 70), cell('tall', 40, 2, 80), cell('gran', 30, 1, 60)]

describe('stämplingen mot skördaren', () => {
  it('bara barr går in i modellen; torra räknas utanför', () => {
    const { rader, utanfor } = raderUrLasning(lasning)
    expect(rader.map(r => [r.slag, r.cm, r.antal])).toEqual([['tall', 30, 10], ['tall', 40, 5], ['gran', 30, 4]])
    expect(utanfor).toBe(1)
  })
  it('prognosen = antal × modellens volym per stam och andelar', () => {
    const j = jamforStampling(lasning, celler, {})
    expect(j.trad).toBe(19)
    expect(j.prognos.vol).toBeCloseTo(10 * 1 + 5 * 2 + 4 * 1)
    expect(j.prognos.timmer).toBeCloseTo(10 * 0.7 + 5 * 2 * 0.8 + 4 * 0.6)
    expect(j.forrattare).toBe('Lars-Börje Nilsson')
  })
  it('procent mot prognosen, aldrig division med noll', () => {
    expect(procentMot(1642, 1419)).toBe(16)
    expect(procentMot(90, 100)).toBe(-10)
    expect(procentMot(5, 0)).toBeNull()
  })
})
