import { describe, expect, it } from 'vitest'
import { snittPerDag, snittPerDagHel } from './snittPerDag'

describe('snittPerDag', () => {
  it('räknar bara dagar med volym', () => {
    expect(snittPerDag([{ m3: 100 }, { m3: 0 }, { m3: 50 }, {}])).toBe(75)
  })
  it('inga dagar med volym ger null, aldrig 0', () => {
    expect(snittPerDag([])).toBeNull()
    expect(snittPerDag([{ m3: 0 }, {}])).toBeNull()
    expect(snittPerDag(undefined)).toBeNull()
  })
  it('hoppar över NaN och negativa', () => {
    expect(snittPerDag([{ m3: NaN }, { m3: -5 }, { m3: 40 }])).toBe(40)
  })
  it('hela m³ på skärmen', () => {
    expect(snittPerDagHel([{ m3: 10 }, { m3: 11 }])).toBe(11)
  })
})
