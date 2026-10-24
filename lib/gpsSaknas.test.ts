import { describe, expect, it } from 'vitest'
import { gpsSaknas, GPS_SAKNAS_MS } from './gpsSaknas'

describe('gpsSaknas — bara när fixen verkligen är borta', () => {
  it('bra fix (senaste för 2 s sedan): aldrig', () => expect(gpsSaknas(100_000, 98_000, 0)).toBe(false))
  it('exakt en minut sedan sista fixen: ännu inte', () => expect(gpsSaknas(60_000 + 10_000, 10_000, 0)).toBe(false))
  it('över en minut sedan sista giltiga fixen: ja', () => expect(gpsSaknas(10_000 + GPS_SAKNAS_MS + 1, 10_000, 0)).toBe(true))
  it('ingen fix alls sedan körvyn öppnades: ja först efter en minut', () => {
    expect(gpsSaknas(30_000, null, 0)).toBe(false)
    expect(gpsSaknas(61_000, null, 0)).toBe(true)
  })
  it('en fix från före körvyn öppnades räknas inte som färsk', () => expect(gpsSaknas(130_000, 5_000, 100_000)).toBe(false))
  it('försvinner direkt när en ny fix kommer', () => {
    expect(gpsSaknas(200_000, 10_000, 0)).toBe(true)
    expect(gpsSaknas(200_001, 200_000, 0)).toBe(false)
  })
  it('körvyn inte öppen: aldrig', () => expect(gpsSaknas(1e9, null, null)).toBe(false))
})
