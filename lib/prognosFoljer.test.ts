import { describe, it, expect } from 'vitest'
import { FOLJER_MIN_H, FOLJER_PRIOR_H, foljPrognos, skillnadText } from './prognosFoljer'

// Skälviken-liknande: 1 000 m³fub, prognos 40 tim (25 m³/tim).
const bas = { volym: 1000, prognosH: 40, utfortH: 0, utfortVolym: 0 }

describe('foljPrognos — prognosen följer trakten', () => {
  it('under MIN_H gäller prognosen rakt av (null)', () => {
    expect(foljPrognos({ ...bas, utfortH: FOLJER_MIN_H - 0.1, utfortVolym: 100 })).toBeNull()
    expect(foljPrognos({ ...bas, utfortH: 10, utfortVolym: 0 })).toBeNull()
    expect(foljPrognos({ ...bas, volym: null, utfortH: 10, utfortVolym: 100 })).toBeNull()
  })

  it('exakt som prognosen: resten = prognos − utfört', () => {
    // 8 tim, 200 m³ = 25 m³/tim = prognosens takt → kvar 800 / 25 = 32
    const r = foljPrognos({ ...bas, utfortH: 8, utfortVolym: 200 })!
    expect(r.restH).toBe(32)
    expect(r.restPlanH).toBe(32)
    expect(r.skillnad).toBe(0)
  })

  it('går dubbelt så fort efter 8 tim: viktat hälften mot prognosen', () => {
    // uppmätt 50 m³/tim, prior 25; 8 tim utfört = PRIOR_H → takt = (25·8 + 50·8)/16 = 37,5; kvar 600 / 37,5 = 16
    const r = foljPrognos({ ...bas, utfortH: FOLJER_PRIOR_H, utfortVolym: 400 })!
    expect(r.restH).toBe(16)
    expect(r.restPlanH).toBe(32)
    expect(r.skillnad).toBe(1)
  })

  it('efter lång tid väger utfallet mer än prognosen', () => {
    // 32 tim, 480 m³ = 15 m³/tim (långsammare); takt = (25·8 + 15·32)/40 = 17; kvar 520/17 = 30,59
    const r = foljPrognos({ ...bas, utfortH: 32, utfortVolym: 480 })!
    expect(r.restH).toBe(30.59)
    expect(r.restPlanH).toBe(8)
    expect(r.skillnad).toBe(-0.4)
  })

  it('utan prognos räknas resten på den uppmätta takten ensam', () => {
    const r = foljPrognos({ volym: 1000, prognosH: null, utfortH: 10, utfortVolym: 300 })!
    expect(r.restH).toBeCloseTo(700 / 30, 2)
    expect(r.restPlanH).toBeNull()
    expect(r.skillnad).toBeNull()
  })

  it('mer gjort än volymen: resten är 0, aldrig negativ', () => {
    const r = foljPrognos({ ...bas, utfortH: 50, utfortVolym: 1100 })!
    expect(r.restH).toBe(0)
    expect(r.restPlanH).toBe(0)
  })
})

describe('skillnadText', () => {
  it('ord, inte tecken', () => {
    expect(skillnadText(0.12)).toBe('12 % fortare än prognosen')
    expect(skillnadText(-0.08)).toBe('8 % långsammare än prognosen')
    expect(skillnadText(0.04)).toBe('som prognosen')
    expect(skillnadText(null)).toBeNull()
  })
})
