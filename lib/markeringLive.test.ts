import { describe, expect, it } from 'vitest'
import { arEgetEko, farskhetGransMin, LIVE_RESERV_MASKIN_MIN } from './markeringLive'

describe('arEgetEko', () => {
  const minne = [{ id: 17, andradTs: 1000 }, { id: 'abc', andradTs: 2000 }]
  it('samma markering med samma ändringstid är mitt eget eko', () => {
    expect(arEgetEko({ marker_id: '17', data: { andradTs: 1000 } }, minne)).toBe(true)
    expect(arEgetEko({ marker_id: 'abc', data: { andradTs: 2000 } }, minne)).toBe(true)
  })
  it('en annans symbol (okänd markering) hämtas', () => {
    expect(arEgetEko({ marker_id: '99', data: { andradTs: 1000 } }, minne)).toBe(false)
  })
  it('samma markering ändrad på en annan skärm hämtas', () => {
    expect(arEgetEko({ marker_id: '17', data: { andradTs: 1500 } }, minne)).toBe(false)
  })
  it('går raden inte att läsa hämtas den – aldrig tyst överhoppad', () => {
    expect(arEgetEko(null, minne)).toBe(false)
    expect(arEgetEko({}, minne)).toBe(false)
    expect(arEgetEko({ marker_id: '17' }, minne)).toBe(false)
    expect(arEgetEko({ marker_id: '17', data: {} }, minne)).toBe(false)
    expect(arEgetEko({ marker_id: '17', data: { andradTs: 0 } }, [{ id: 17 }])).toBe(false)
  })
})

describe('farskhetGransMin', () => {
  it('maskinen hämtar om efter en minut, planeringen behåller sin gräns', () => {
    expect(farskhetGransMin(true, 10)).toBe(LIVE_RESERV_MASKIN_MIN)
    expect(farskhetGransMin(false, 10)).toBe(10)
  })
})

describe('sidan lyssnar på nya och ändrade markeringar', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const page: string = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'app', 'planering', 'page.tsx'), 'utf8')
  it('INSERT och UPDATE på objektets rader, utöver DELETE', () => {
    expect(page).toContain("{ event: 'INSERT', schema: 'public', table: 'planering_markeringar', filter }, nyEllerAndrad)")
    expect(page).toContain("{ event: 'UPDATE', schema: 'public', table: 'planering_markeringar', filter }, nyEllerAndrad)")
    expect(page).toContain("{ event: 'DELETE', schema: 'public', table: 'planering_markeringar' }")
  })
  it('hämtningen efter en händelse är tvingad (5 s-spärren får inte tappa en symbol) och mitt eget eko hoppas över', () => {
    expect(page).toContain('samla = setTimeout(() => { samla = null; refetchMarkers(true); }, LIVE_SAMLA_MS);')
    expect(page).toContain('if (arEgetEko(payload?.new, markersRef.current as any[])) return;')
  })
  it('reserven: i maskinen hämtas markeringarna om efter en minut', () => {
    expect(page).toContain('>= farskhetGransMin(maskinlage, FARSKHET_GAMMAL_MIN)) refetchMarkers(false);')
  })
})
