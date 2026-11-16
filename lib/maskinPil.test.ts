import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { MASKIN_PIL_BILD, MASKIN_PIL_BILD_GRA, MASKIN_PIL_UTTRYCK, maskinPilFarg, maskinPilSvg } from './maskinPil'
import { FARG } from './design/tokens'

describe('maskinen är en pil', () => {
  it('blå med vit kant; grå när positionen inte går att lita på', () => {
    expect(maskinPilFarg(false)).toBe(FARG.bla)
    expect(maskinPilFarg(true)).toBe(FARG.text3)
    expect(maskinPilSvg(FARG.bla)).toContain(`fill="${FARG.bla}" stroke="#ffffff"`)
  })
  it('lagret väljer den grå bilden när featuren är gammal', () => {
    expect(MASKIN_PIL_UTTRYCK).toEqual(['case', ['==', ['get', 'gammal'], true], MASKIN_PIL_BILD_GRA, MASKIN_PIL_BILD])
  })
})

describe('körvyn ritar EN sak för maskinen', () => {
  const page = readFileSync('app/planering/page.tsx', 'utf8')
  it('pricken, käglan och strecket framåt tänds aldrig', () => {
    expect(page).toContain("const layers = [BASVAG_SKEN_ID, 'maskin-symbol', 'bg-korvy', 'hillshade-korvy'];")
    expect(page).toContain("for (const id of ['gps-cone-fill', 'maskin-halo', 'maskin-ring']) { try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); } catch {} }")
    expect(page).not.toContain("getSource('gps-cone-source') as any")   // strecket framåt får ingen data längre
  })
  it('den blå gps-pricken ritas inte också i körvyn', () => {
    expect(page).toContain("stickvagMode || korvyActive ? 'none' : 'visible'")
  })
  it('pilen är lika stor vid varje zoom och grå utan färsk GPS', () => {
    expect(page).toContain("'icon-size': 1,")
    expect(page).toContain('properties: { heading: korvyHeading, gammal: !gpsFixFarsk && !testlage },')
  })
  it('cirkeln runt skördaren ritas bara när något gäller', () => {
    expect(page).toContain('pos.lon != null && (!!fall.grupp || !!fgFall);')
  })
})
