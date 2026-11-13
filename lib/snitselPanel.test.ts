import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { snitselGpsText, snitselMatare, snitselRiktning, snitselTon } from './snitselPanel'

const L = (dist: number | null) => ({ dist, target: 20, tol: 3 })

describe('gå-läget: siffran och vad man ska göra', () => {
  it('inom målet (17–23 m vid mål 20 ± 3) är grönt och säger Inom mål', () => {
    for (const d of [17, 20, 23]) { expect(snitselTon(L(d))).toBe('inom'); expect(snitselRiktning(L(d))).toBe('Inom mål') }
  })
  it('för nära: orange och hur långt det är kvar', () => {
    expect(snitselTon(L(14))).toBe('utanfor'); expect(snitselRiktning(L(14))).toBe('6 m till')
  })
  it('för långt: orange och hur mycket för långt', () => {
    expect(snitselTon(L(26))).toBe('utanfor'); expect(snitselRiktning(L(26))).toBe('6 m för långt')
  })
  it('ingen väg att mäta mot: neutral, aldrig 0', () => {
    expect(snitselTon(L(null))).toBe('neutral'); expect(snitselRiktning(L(null))).toBe('Första vägen')
  })
})

describe('mätaren', () => {
  it('målet ligger mitt på, bandet är toleransen, pricken nålas vid kanten', () => {
    expect(snitselMatare(L(20))).toMatchObject({ prick: 50, bandFran: 40, bandTill: 60, utanforSkala: false })
    expect(snitselMatare(L(60))).toMatchObject({ prick: 100, utanforSkala: true })
    expect(snitselMatare(L(1))).toMatchObject({ prick: 0, utanforSkala: true })
    expect(snitselMatare(L(null)).prick).toBeNull()
  })
})

describe('GPS-raden säger när siffran inte går att lita på', () => {
  it('söker, bra, osäker', () => {
    expect(snitselGpsText(null)).toEqual({ text: 'Söker GPS …', osaker: false })
    expect(snitselGpsText(3.4)).toEqual({ text: 'GPS ±3 m', osaker: false })
    expect(snitselGpsText(22)).toEqual({ text: 'Osäker position · ±22 m', osaker: true })
  })
})

describe('sidan: meter överst och kartan under — ingen växel mellan dem', () => {
  const sida = fs.readFileSync(path.resolve(__dirname, '../app/planering/page.tsx'), 'utf8')
  it('panelen ritas i gå-läget och den gamla växeln är borta', () => {
    expect(sida).toContain('<SnitselPanel dist={dist}')
    expect(sida).not.toContain('snitselKarta ?')
    expect(sida).not.toContain('setSnitselKarta')
    expect(sida).not.toContain("'🗺 Karta'")
  })
  it('kartan följer positionen under panelen', () => {
    expect(sida).toMatch(/center: \[gpsPosition\.lng, gpsPosition\.lat\], padding: \{ top: snitselPanelH/)
  })
  it('rutan heter Gallring och står först på en gallringstrakt', () => {
    expect(sida).toContain("titel: 'Gallring – snitsla stickvägar'")
    expect(sida).toMatch(/gallring \? \[\.\.\.alla\.filter\(\(r\) => r\.id === 'stickvagar'\)/)
  })
})
