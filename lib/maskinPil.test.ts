import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { MASKIN_PIL_BILD, MASKIN_PIL_BILD_GRA, MASKIN_PIL_BILD_GUL, MASKIN_PIL_UTTRYCK, maskinPilFarg, maskinPilLage, maskinPilSvg } from './maskinPil'
import { FARG } from './design/tokens'

describe('maskinen är en pil', () => {
  it('blå = bra, gul = dålig noggrannhet, grå = ingen färsk GPS', () => {
    expect(maskinPilFarg('bra')).toBe(FARG.bla)
    expect(maskinPilFarg('grov')).toBe(FARG.gul)
    expect(maskinPilFarg('gammal')).toBe(FARG.text3)
    expect(maskinPilSvg(FARG.bla)).toContain(`fill="${FARG.bla}" stroke="#ffffff"`)
  })
  it('läget: ingen färsk GPS går före; gul först över 20 m; fast GPS (okänd noggrannhet) blir aldrig gul', () => {
    expect(maskinPilLage({ farsk: false, noggrannhetM: 5 })).toBe('gammal')
    expect(maskinPilLage({ farsk: true, noggrannhetM: 20 })).toBe('bra')
    expect(maskinPilLage({ farsk: true, noggrannhetM: 21 })).toBe('grov')
    expect(maskinPilLage({ farsk: true, noggrannhetM: null })).toBe('bra')
  })
  it('lagret väljer bild efter läget', () => {
    expect(MASKIN_PIL_UTTRYCK).toEqual(['match', ['get', 'lage'], 'gammal', MASKIN_PIL_BILD_GRA, 'grov', MASKIN_PIL_BILD_GUL, MASKIN_PIL_BILD])
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
  it('pilen är lika stor vid varje zoom, läget bärs av pilen och ingen osäkerhetscirkel ritas', () => {
    expect(page).toContain("'icon-size': 1,")
    expect(page).toContain("lage: maskinPilLage({ farsk: gpsFixFarsk || !!testlage, noggrannhetM: gpsKallaTyp === 'geolocation' && !testlage ? gpsAccuracy : null })")
    expect(page).toContain("const visaCirkel = draw && !korvyActive && gpsKallaTyp === 'geolocation'")   // ingen osäkerhetscirkel i körvyn
  })
  it('cirkeln runt skördaren ritas bara när något gäller', () => {
    expect(page).toContain('pos.lon != null && (!!fall.grupp || !!fgFall);')
  })
})
