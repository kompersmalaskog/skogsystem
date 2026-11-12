import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { LAGER_UTAN_RAD, lagerUtanDubbletter, wmsLayerGroups } from './mapLayers'

// Lager-menyn (Martin 2026-11-12, Oskars maskin): "det var flera lager som var samma".
const OVERLAY = ['vidaKartbild', 'hansyn', 'traktNyckelbiotop', 'traktLamning', 'korFara', 'sks_markfuktighet', 'fastighetsgrans', 'hydrografi']

describe('Lager-menyn: varje lager står en gång', () => {
  const rader = wmsLayerGroups.flatMap((g) => lagerUtanDubbletter(g.layers, OVERLAY))
  it('det som står under Overlay står inte en gång till under sin myndighet', () => {
    expect(rader.map((r) => r.id)).not.toContain('sks_markfuktighet')
    expect(rader.map((r) => r.id)).not.toContain('hydrografi')
  })
  it('Ortofoto LM (samma bild som bakgrunden Flygfoto) och fastighetsgränsens Lantmäteri-lager har ingen rad', () => {
    expect(rader.map((r) => r.id)).not.toContain('lm_ortofoto')
    expect(rader.map((r) => r.id)).not.toContain('fastighetsgranser')
  })
  it('inget id och inget namn förekommer två gånger', () => {
    const idn = [...OVERLAY, ...rader.map((r) => r.id)]
    expect(new Set(idn).size).toBe(idn.length)
    const namn = rader.map((r) => r.name)
    expect(new Set(namn).size).toBe(namn.length)
  })
  it('Sumpskog finns kvar som EN rad', () => {
    expect(rader.filter((r) => /sumpskog/i.test(r.name)).map((r) => r.id)).toEqual(['sumpskog'])
    expect(LAGER_UTAN_RAD.has('wetlands')).toBe(true)
  })
})

describe('sidans koppling', () => {
  const sida = readFileSync('app/planering/page.tsx', 'utf8')
  it('Overlay-listan har inte kvar wetlands, och menyn byggs med lagerUtanDubbletter', () => {
    expect(sida).not.toMatch(/id: 'wetlands', name:/)
    expect(sida).toMatch(/lagerUtanDubbletter\(grp\.layers, overlayLista\.map/)
  })
  it('körvyns whitelist kör om lagereffekterna: det som är tänt i menyn är tänt på kartan', () => {
    expect(sida).toMatch(/setLagerTick\(\(t\) => t \+ 1\);\n  \}, \[korvyActive, skotarKorvy, mapLibreReady, korvyBasKarta\]\);/)
    expect(sida).toMatch(/\[overlays, mapLibreReady, lagerTick, korvyActive\]/)
    expect(sida).toMatch(/\[hogarPa, skotarKorvy, korvyActive, mapLibreReady, lagerTick\]/)
    expect(sida).toMatch(/\[overlays\.grothogar, mapLibreReady, lagerTick\]/)
  })
  it('ett lager utan rad är aldrig tänt', () => {
    expect(sida).toMatch(/overlays\[id\] && !LAGER_UTAN_RAD\.has\(id\)/)
  })
})
