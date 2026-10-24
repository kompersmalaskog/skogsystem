import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sida = readFileSync('app/planering/page.tsx', 'utf8')
const kalla = readFileSync('lib/gpsKalla.ts', 'utf8')
const hook = readFileSync('lib/hooks/useSkotarLass.ts', 'utf8')

describe('hyttspår utan luckor — kopplingen i sidan', () => {
  it('tunningen av osynkade punkter går över tunnaOsynkade (aldrig rdpThin rakt på alla punkter — det skulle tunna bort luckmarkeringen)', () => {
    expect(sida).toContain('tunnaOsynkade(')
    expect(sida).not.toMatch(/rdpThin\(\s*\[\s*\.\.\.ankar/)
  })
  it('puls-punkten släpps förbi GPS-vakten och luckan märks på punkten', () => {
    expect(sida).toContain('arPulspunkt(cand, hyttsparLastFixRef.current)')
    expect(sida).toContain('arEfterLucka(')
    expect(sida).toContain('lucka: true')
  })
  it('skotarläget får hyttspåret som källa till lassets spår', () => {
    expect(sida).toContain('hamtaHyttspar: () => hyttsparPointsRef.current')
    expect(hook).toContain('sparUrHyttspar(')
  })
  it('"GPS saknas" visas bara via gpsSaknas() — och den gamla 5 s-bannern finns inte', () => {
    expect(sida).toContain('gpsSaknas(Date.now(), senasteGiltigFixRef.current')
    expect(sida).toContain('gpsSaknasNu && korvyActive && !startOverlayAktiv && (')
    expect(sida).not.toContain('Ingen GPS-fix')   // EN regel: ingen GPS-text förrän "GPS saknas" efter 60 s
  })
  it('källan strypt till en fix per sekund i serial-loopen', () => {
    expect(kalla).toContain('skaNotifiera(strypState, fix, nuMs)')
  })
})
