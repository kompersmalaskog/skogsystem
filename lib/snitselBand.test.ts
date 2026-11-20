import { describe, expect, it } from 'vitest'
import { avstandTillBana, banLangd, byggBand, kantAvstand, mittAvstand, sidaPoang, sidoBana, STICKVAG_BREDD_M, tatBana } from './snitselBand'

const rak = [{ x: 0, y: 0 }, { x: 100, y: 0 }]

describe('kant till kant', () => {
  it('25 m skog och 4,5 m väg = 29,5 m mitt till mitt', () => {
    expect(STICKVAG_BREDD_M).toBe(4.5)
    expect(mittAvstand(25, 4.5)).toBe(29.5)
  })
  it('siffran föraren ser är skogen mellan kanterna', () => {
    expect(kantAvstand(29.5, 4.5)).toBe(25)
    expect(kantAvstand(25, 4)).toBe(21)
    expect(kantAvstand(2, 4.5)).toBe(0)
    expect(kantAvstand(null, 4.5)).toBeNull()
  })
})

describe('sidoBana', () => {
  it('rak väg: bandet ligger exakt d åt sidan, lika långt', () => {
    const [v] = sidoBana(rak, 29.5, 1)
    expect(v.every((p) => Math.abs(p.y - 29.5) < 1e-9)).toBe(true)
    expect(banLangd(v)).toBeCloseTo(100, 6)
    const [h] = sidoBana(rak, 29.5, -1)
    expect(h.every((p) => Math.abs(p.y + 29.5) < 1e-9)).toBe(true)
  })
  it('varje punkt i bandet ligger minst d från vägen — även på insidan av en skarp sväng', () => {
    const vinkel = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
    for (const sida of [1, -1] as const) {
      const bitar = sidoBana(vinkel, 29.5, sida)
      expect(bitar.length).toBeGreaterThan(0)
      for (const p of bitar.flat()) expect(avstandTillBana(p, vinkel)).toBeGreaterThanOrEqual(29.5 * 0.98 - 1e-9)
    }
  })
  it('utsidan av en skarp sväng är EN bit, rundad på avståndet d', () => {
    const vinkel = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
    const ut = sidoBana(vinkel, 20, -1)
    expect(ut.length).toBe(1)
    for (let i = 1; i < ut[0].length; i++) expect(Math.hypot(ut[0][i].x - ut[0][i - 1].x, ut[0][i].y - ut[0][i - 1].y)).toBeLessThan(20 / 12 * 2 + 1e-6)
    for (const p of ut[0]) expect(avstandTillBana(p, vinkel)).toBeGreaterThanOrEqual(20 * 0.98 - 1e-9)
  })
  it('utsidan av en sväng hänger ihop, insidan kortas', () => {
    const vinkel = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
    const ut = sidoBana(vinkel, 20, -1), inn = sidoBana(vinkel, 20, 1)
    expect(banLangd(ut.flat())).toBeGreaterThan(banLangd(inn.flat()))
  })
  it('för kort väg eller inget avstånd ger inget band', () => {
    expect(sidoBana([{ x: 0, y: 0 }], 20, 1)).toEqual([])
    expect(sidoBana(rak, 0, 1)).toEqual([])
  })
  it('tatBana behåller ändarna och håller steget', () => {
    const t = tatBana(rak, 7)
    expect(t[0]).toEqual(rak[0]); expect(t[t.length - 1]).toEqual(rak[1])
    for (let i = 1; i < t.length; i++) expect(Math.hypot(t[i].x - t[i - 1].x, t[i].y - t[i - 1].y)).toBeLessThanOrEqual(7 + 1e-9)
  })
})

describe('vilken sida', () => {
  it('väljer sidan som ligger inne i trakten', () => {
    const b = byggBand(rak, 29.5, { inne: (p) => p.y < 0 })
    expect(b?.sida).toBe(-1)
    expect(byggBand(rak, 29.5, { inne: (p) => p.y > 0 })?.sida).toBe(1)
  })
  it('väljer bort sidan där det redan går en väg', () => {
    const andra = [[{ x: 0, y: 29.5 }, { x: 100, y: 29.5 }]]
    expect(byggBand(rak, 29.5, { andra })?.sida).toBe(-1)
  })
  it('lika bra åt båda håll → alltid vänster', () => {
    expect(byggBand(rak, 29.5)?.sida).toBe(1)
  })
  it('förarens val går före', () => {
    expect(byggBand(rak, 29.5, { inne: (p) => p.y > 0 }, -1)?.sida).toBe(-1)
  })
  it('poängen är andelen bra punkter', () => {
    const bitar = sidoBana(rak, 10, 1)
    expect(sidaPoang(bitar, 10)).toBe(1)
    expect(sidaPoang(bitar, 10, { inne: () => false })).toBe(0)
    expect(sidaPoang([], 10)).toBe(0)
  })
  it('ingen väg → inget band', () => {
    expect(byggBand([], 29.5)).toBeNull()
  })
})
