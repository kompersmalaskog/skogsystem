// @vitest-environment jsdom
/** Vilka enheter byter till maskinkontot av sig själva: bara en riktig maskindator med en inloggad förare/admin. */
import { describe, it, expect, beforeEach } from 'vitest'
import { skaBlimaMaskin, arUndantagenSokvag, AUTO_PAUS_MS, AUTO_PAUS_NYCKEL, lasAutoPaus, sattAutoPaus, type AutoIndata } from './autoStart'

const NU = 1_800_000_000_000
const maskindator: AutoIndata = { roll: 'forare', pathname: '/', harWebSerial: true, serialFlagga: true, beviljadePortar: 0, enhetMaskinId: 'R64428', pausTill: 0, nu: NU }
const med = (o: Partial<AutoIndata>): AutoIndata => ({ ...maskindator, ...o })

describe('skaBlimaMaskin', () => {
  it('en riktig maskindator (Web Serial + maskinens GPS + vald maskin) med en förare eller admin inloggad: JA', () => {
    expect(skaBlimaMaskin(maskindator)).toBe(true)
    expect(skaBlimaMaskin(med({ roll: 'admin' }))).toBe(true)
  })
  it('maskinens GPS räknas som ansluten även utan flaggan, om webbläsaren redan beviljat en port', () => {
    expect(skaBlimaMaskin(med({ serialFlagga: false, beviljadePortar: 1 }))).toBe(true)
  })
  it('ingen maskinens GPS (hemdator med Web Serial men ingen port): NEJ', () => {
    expect(skaBlimaMaskin(med({ serialFlagga: false, beviljadePortar: 0 }))).toBe(false)
  })
  it('telefon och surfplatta (ingen Web Serial): NEJ, oavsett vad mer som finns', () => {
    expect(skaBlimaMaskin(med({ harWebSerial: false }))).toBe(false)
    expect(skaBlimaMaskin(med({ harWebSerial: false, serialFlagga: true, beviljadePortar: 2 }))).toBe(false)
  })
  it('enheten vet inte vilken maskin den är: NEJ', () => {
    for (const enhetMaskinId of [null, '', '  ']) expect(skaBlimaMaskin(med({ enhetMaskinId }))).toBe(false)
  })
  it('testläget ("Testa som maskin", /maskin?som=…), inloggningen och inbjudan: NEJ', () => {
    for (const pathname of ['/maskin', '/maskin/', '/maskin/x', '/login', '/valkommen']) expect(skaBlimaMaskin(med({ pathname }))).toBe(false)
    expect(skaBlimaMaskin(med({ pathname: '/planering' }))).toBe(true)
    expect(skaBlimaMaskin(med({ pathname: '/maskinvy' }))).toBe(true)           // bara /maskin är testläget, inte allt som börjar på "maskin"
    expect(arUndantagenSokvag('/maskinkoll')).toBe(false)
  })
  it('maskinkontot självt, ingen inloggad och okända roller: NEJ', () => {
    for (const roll of ['maskin', null, undefined, '', 'chef', 'Admin']) expect(skaBlimaMaskin(med({ roll }))).toBe(false)
  })
  it('pausen efter "Logga ut maskinen" gäller tills den gått ut', () => {
    expect(skaBlimaMaskin(med({ pausTill: NU + 1 }))).toBe(false)
    expect(skaBlimaMaskin(med({ pausTill: NU }))).toBe(true)
    expect(skaBlimaMaskin(med({ pausTill: NU - 1 }))).toBe(true)
  })
})

describe('pausen i enheten', () => {
  beforeEach(() => localStorage.clear())
  it('sparas och läses; tom/trasig lagring är ingen paus', () => {
    expect(lasAutoPaus()).toBe(0)
    sattAutoPaus(NU + AUTO_PAUS_MS); expect(lasAutoPaus()).toBe(NU + AUTO_PAUS_MS)
    sattAutoPaus(null); expect(lasAutoPaus()).toBe(0)
    localStorage.setItem(AUTO_PAUS_NYCKEL, 'skräp'); expect(lasAutoPaus()).toBe(0)
  })
})
