import { describe, it, expect } from 'vitest'
import { FAKTURERING_START, FAKTURERING_START_TEXT, startText, hanteradUtanforAppen } from './start'

describe('appens startdatum för fakturering', () => {
  it('är 1 november 2026 (Martin 2026-11-20)', () => {
    expect(FAKTURERING_START).toBe('2026-11-01')
    expect(FAKTURERING_START_TEXT).toBe('1 november 2026')
  })

  it('datumet skrivs i ord, utan nolla framför dagen', () => {
    expect(startText('2026-11-01')).toBe('1 november 2026')
    expect(startText('2026-02-18')).toBe('18 februari 2026')
    expect(startText('2025-12-31')).toBe('31 december 2025')
  })

  it('ett datum som inte går att läsa skrivs som det är, aldrig som "NaN"', () => {
    expect(startText('skräp')).toBe('skräp')
    expect(startText('2026-13-01')).toBe('2026-13-01')
  })

  it('före startdagen = hanterat utanför appen; startdagen själv är med', () => {
    expect(hanteradUtanforAppen('2026-10-31')).toBe(true)
    expect(hanteradUtanforAppen('2026-11-01')).toBe(false)
    expect(hanteradUtanforAppen('2026-11-13')).toBe(false)
    expect(hanteradUtanforAppen('2026-01-07')).toBe(true)
  })

  it('utan datum är svaret NEJ — odaterat är inte bevisligen gammalt', () => {
    expect(hanteradUtanforAppen(null)).toBe(false)
    expect(hanteradUtanforAppen(undefined)).toBe(false)
    expect(hanteradUtanforAppen('')).toBe(false)
  })

  it('startdagen går att byta för ett test utan att röra konstanten', () => {
    expect(hanteradUtanforAppen('2026-10-31', '2000-01-01')).toBe(false)
    expect(hanteradUtanforAppen('2026-10-31', '2027-01-01')).toBe(true)
  })
})
