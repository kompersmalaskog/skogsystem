import { describe, it, expect } from 'vitest'
import { TRADSLAG_STIL, tradslagFargNeutral } from './tradslag'
import { FARG } from './design/tokens'

// Maskinvyns trädslagskort: kategorier får aldrig bära status-/larmfärg (grön = ok, orange = varning, gul, röd).
const STATUS = [FARG.gron, FARG.orange, FARG.rod, FARG.gul].map(c => c.toLowerCase())

describe('tradslagFargNeutral', () => {
  const alla = [...Object.keys(TRADSLAG_STIL), 'Okänt trädslag', 'Något helt nytt']

  it('ingen art, ingen reservfärg, har en statusfärg', () => {
    for (const namn of alla) for (let i = 0; i < 8; i++) {
      expect(STATUS).not.toContain(tradslagFargNeutral(namn, i).toLowerCase())
    }
  })

  it('Tall är inte längre orange (blev en varning på kortet) och Gran inte grön', () => {
    expect(tradslagFargNeutral('Tall').toLowerCase()).not.toBe(FARG.orange.toLowerCase())
    expect(tradslagFargNeutral('Gran').toLowerCase()).not.toBe(FARG.gron.toLowerCase())
  })

  it('de fyra vanliga arterna är åtskilda', () => {
    const f = ['Gran', 'Tall', 'Björk', 'Övrigt löv'].map(n => tradslagFargNeutral(n))
    expect(new Set(f).size).toBe(4)
  })

  it('okända arter i samma diagram får olika färg (index skiljer dem åt)', () => {
    expect(tradslagFargNeutral('X', 0)).not.toBe(tradslagFargNeutral('Y', 1))
  })
})
