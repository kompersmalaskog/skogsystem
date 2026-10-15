import { describe, it, expect } from 'vitest'
import { antalKolumner, hogerFlik, kolumnerBredd, kortBredd, KORT_MAX_PX, lageForBredd, panelPlats, PANEL_PX } from './layout'

describe('lageForBredd', () => {
  it('gränserna: <600 telefon, 600–1100 iPad, >1100 stor', () => {
    expect(lageForBredd(390)).toBe('telefon')
    expect(lageForBredd(599)).toBe('telefon')
    expect(lageForBredd(600)).toBe('ipad')
    expect(lageForBredd(820)).toBe('ipad')
    expect(lageForBredd(1100)).toBe('ipad')
    expect(lageForBredd(1101)).toBe('stor')
    expect(lageForBredd(1180)).toBe('stor')
    expect(lageForBredd(1600)).toBe('stor')
  })
  it('antal kolumner följer läget', () => {
    expect([lageForBredd(390), lageForBredd(820), lageForBredd(1180)].map(antalKolumner)).toEqual([1, 2, 3])
  })
})

describe('kortbredd', () => {
  it('ett kort är aldrig bredare än 420', () => {
    for (const b of [600, 820, 1100, 1101, 1180, 1600, 1920, 2560]) expect(kortBredd(b, antalKolumner(lageForBredd(b)))).toBeLessThanOrEqual(KORT_MAX_PX)
  })
  it('tre kolumner får plats utan att korten blir smalare än 340 px — redan vid 1 101 px (första stora bredden)', () => {
    expect(kortBredd(1101, 3)).toBeGreaterThanOrEqual(340)
    expect(kortBredd(1180, 3)).toBeGreaterThanOrEqual(340)
  })
  it('kolumngruppens bredd = n kort + mellanrum', () => {
    expect(kolumnerBredd(3)).toBe(3 * 420 + 2 * 16)
  })
})

describe('panelPlats', () => {
  it('panelen läggs över kolumnerna när korten annars skulle bli smalare (iPad, 1 180, 1 600)', () => {
    expect(panelPlats(820, 2)).toBe(false)
    expect(panelPlats(1100, 2)).toBe(false)
    expect(panelPlats(1180, 3)).toBe(false)
    expect(panelPlats(1600, 3)).toBe(false)
  })
  it('panelen får plats bredvid när kolumnerna behåller sin bredd', () => {
    expect(panelPlats(1920, 3)).toBe(true)
    expect(panelPlats(2560, 3)).toBe(true)
  })
  it('gränsen: plats = kolumngrupp + panel + mellanrum + sidmarginaler', () => {
    const gräns = kolumnerBredd(3) + PANEL_PX + 16 + 32
    expect(panelPlats(gräns, 3)).toBe(true)
    expect(panelPlats(gräns - 1, 3)).toBe(false)
  })
  it('telefon har ingen panel', () => {
    expect(panelPlats(390, 1)).toBe(false)
  })
})

describe('hogerFlik', () => {
  it('flik=lage på iPad betyder Planering', () => {
    expect(hogerFlik('lage')).toBe('planering')
    expect(hogerFlik('planering')).toBe('planering')
    expect(hogerFlik('uppfoljning')).toBe('uppfoljning')
  })
})
