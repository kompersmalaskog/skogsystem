import { describe, it, expect } from 'vitest'
import { tolkaArtikelsvar } from './fortnox'

/** Så ser Fortnox svar ut på GET /3/articles/{nr}. */
const artikel = (f: Record<string, any>) =>
  JSON.stringify({ Article: { ArticleNumber: '5', Description: 'Flytt av maskin', Unit: 'st', ...f } })

describe('tolkaArtikelsvar — tre fel som leder till tre olika åtgärder', () => {

  it('404 är artikel_saknas, inte "Fortnox svarade inte"', () => {
    const r = tolkaArtikelsvar(404, '{"ErrorInformation":{"message":"Kan inte hitta artikeln"}}', null)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.fel).toBe('artikel_saknas')
  })

  it('403 (scope saknas) är fortnox_svarade_inte — artikelregistret är oskyldigt', () => {
    // Fortnox delar ut scopes vid auktorisering. Efter att article+price lagts
    // till i SCOPE svarar gamla tokens 403 tills någon re-auktoriserat. Det är
    // vårt fel och åtgärdas i /api/fortnox/auth — inte genom att röra artikeln.
    const r = tolkaArtikelsvar(403, 'Forbidden', null)
    expect(!r.ok && r.fel).toBe('fortnox_svarade_inte')
  })

  it('nätverksfel (status 0) klassas som fortnox_svarade_inte', () => {
    const r = tolkaArtikelsvar(0, 'fetch failed', null)
    expect(!r.ok && r.fel).toBe('fortnox_svarade_inte')
  })

  it('artikeln finns men saknar pris → pris_saknas', () => {
    expect(!tolkaArtikelsvar(200, artikel({ SalesPrice: null }), null).ok).toBe(true)
    const r = tolkaArtikelsvar(200, artikel({ SalesPrice: null }), null)
    expect(!r.ok && r.fel).toBe('pris_saknas')
    // Fortnox skickar ibland tom sträng i stället för null.
    expect(!tolkaArtikelsvar(200, artikel({ SalesPrice: '' }), null).ok && 'pris_saknas').toBeTruthy()
  })

  it('0 KR ÄR ETT PRIS — artikel 8 faktureras 1 st à 0', () => {
    // Den viktigaste raden i filen. Klassas noll som "saknas" blockeras varje
    // underlag som innehåller krönt mätning, och spärren ser ut som ett
    // datafel i stället för en bugg i tolkningen.
    const r = tolkaArtikelsvar(200, artikel({ ArticleNumber: '8', SalesPrice: 0 }), null)
    expect(r.ok).toBe(true)
    expect(r.ok && r.pris).toBe(0)
  })

  it('priset som sträng tolkas som tal — men skräp gör det inte till 0', () => {
    expect(tolkaArtikelsvar(200, artikel({ SalesPrice: '1500' }), null)).toMatchObject({ ok: true, pris: 1500 })
    // Number('abc') = NaN. Utan kontrollen hade NaN runnit vidare in i
    // faktura_rad.a_pris och blivit null i jsonb — ett tyst nollpris.
    const r = tolkaArtikelsvar(200, artikel({ SalesPrice: 'abc' }), null)
    expect(!r.ok && r.fel).toBe('fortnox_svarade_inte')
  })

  it('benämning och enhet följer med — fakturaraden ska säga Fortnox ord, inte våra', () => {
    const r = tolkaArtikelsvar(200, artikel({ SalesPrice: 1500 }), null)
    expect(r.ok && r.benamning).toBe('Flytt av maskin')
    expect(r.ok && r.enhet).toBe('st')
  })

  it('200 med oläsbar kropp är fortnox_svarade_inte, inte artikel_saknas', () => {
    const r = tolkaArtikelsvar(200, '<html>502 Bad Gateway</html>', null)
    expect(!r.ok && r.fel).toBe('fortnox_svarade_inte')
  })
})
