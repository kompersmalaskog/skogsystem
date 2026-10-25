import { describe, it, expect } from 'vitest'
import {
  byggFakturaLage, kontraktsnrUrRad, lageFor, normaliseraKnr,
  senasteFakturan, slutredovisningen, type FakturaRadUr,
} from './fakturaLage'

// FACIT prod 2026-10-25 (fortnox_invoice_rows, 822 rader / 134 fakturor):
//   artikel 8 "Kontraktsnr <nr>": 111 rader, 88 distinkta nummer, exakt ETT
//     nummer per faktura
//   artikel 7 "Slutredovisning": 32 rader på 31 fakturor
//   mot objekt.kontraktsnummer (39 av 69 trakter har ett): 36 rader / 28 trakter
//   matched_objekt_id: 0 av 822 — synkens VO-regex matchar ingenting
const rad = (o: Partial<FakturaRadUr>): FakturaRadUr => ({
  document_number: 2026181, invoice_date: '2026-10-19',
  article_number: '8', description: 'Kontraktsnr 968539', ...o,
})

describe('kontraktsnumret ur fakturaraden', () => {
  it('läser numret ur artikel 8 — den rad Vida känner igen trakten på', () => {
    expect(kontraktsnrUrRad(rad({}))).toBe('968539')
  })

  it('bara artikel 8 bär numret', () => {
    expect(kontraktsnrUrRad(rad({ article_number: '1', description: 'Skördning Gigant' }))).toBeNull()
    expect(kontraktsnrUrRad(rad({ article_number: '7', description: 'Slutredovisning' }))).toBeNull()
    expect(kontraktsnrUrRad(rad({ article_number: null, description: 'Kontraktsnr 968539' }))).toBeNull()
  })

  it('blanksteg i numret spelar ingen roll — båda sidor normaliseras', () => {
    expect(kontraktsnrUrRad(rad({ description: 'Kontraktsnr 968 539' }))).toBe('968539')
    expect(normaliseraKnr(' 968 539 ')).toBe('968539')
    expect(normaliseraKnr('')).toBeNull()
    expect(normaliseraKnr(null)).toBeNull()
  })

  it('en maskinobjektnyckel i samma fält tas som den är och matchar ingen trakt', () => {
    // Prod har en sådan: "Kontraktsnr A130266-26-2-2-1".
    expect(kontraktsnrUrRad(rad({ description: 'Kontraktsnr A130266-26-2-2-1' })))
      .toBe('A130266-26-2-2-1')
  })

  it('en artikel 8-rad utan nummer ger null, aldrig en tom nyckel som matchar allt', () => {
    expect(kontraktsnrUrRad(rad({ description: 'Kontraktsnr' }))).toBeNull()
    expect(kontraktsnrUrRad(rad({ description: null }))).toBeNull()
  })
})

describe('byggFakturaLage', () => {
  // Bågskyttebanan: en faktura, ingen slutredovisning.
  // Rävemåla: vanlig faktura 21 sep + slutredovisning på en SENARE faktura.
  // Vällust: kontraktsnummer men ingen faktura.
  // Anders Ingemarsson: inget kontraktsnummer.
  const objekt = [
    { vo_nummer: '11271849', kontraktsnummer: '968539' },
    { vo_nummer: '11241031', kontraktsnummer: '974073' },
    { vo_nummer: '11251428', kontraktsnummer: '971710' },
    { vo_nummer: '11106406', kontraktsnummer: null },
  ]
  const rader: FakturaRadUr[] = [
    rad({ document_number: 2026181, invoice_date: '2026-10-19', description: 'Kontraktsnr 968539' }),
    rad({ document_number: 2026181, invoice_date: '2026-10-19', article_number: '1', description: 'Skördning Gigant' }),
    rad({ document_number: 2026158, invoice_date: '2026-09-21', description: 'Kontraktsnr 974073' }),
    rad({ document_number: 2026183, invoice_date: '2026-10-19', description: 'Kontraktsnr 974073' }),
    rad({ document_number: 2026183, invoice_date: '2026-10-19', article_number: '7', description: 'Slutredovisning' }),
  ]
  const lage = byggFakturaLage(objekt, rader)

  it('kopplar trakt → faktura på kontraktsnumret', () => {
    expect(lageFor(lage['11271849'])).toBe('fakturerat')
    expect(senasteFakturan(lage['11271849'])!.nummer).toBe(2026181)
  })

  it('slutredovisningen kan ligga på en senare faktura än den vanliga', () => {
    expect(lageFor(lage['11241031'])).toBe('slutredovisat')
    expect(lage['11241031'].fakturor.map(f => f.nummer)).toEqual([2026158, 2026183])
    expect(slutredovisningen(lage['11241031'])!.nummer).toBe(2026183)
    expect(slutredovisningen(lage['11241031'])!.datum).toBe('2026-10-19')
  })

  it('kontraktsnummer utan faktura är ofakturerat — det som faktiskt återstår', () => {
    expect(lageFor(lage['11251428'])).toBe('ofakturerat')
    expect(lage['11251428'].fakturor).toEqual([])
  })

  it('utan kontraktsnummer är läget OKÄNT, aldrig ofakturerat', () => {
    expect(lageFor(lage['11106406'])).toBe('okant')
    // En trakt som inte ens finns som objektrad: samma svar.
    expect(lageFor(lage['finns-inte'])).toBe('okant')
    expect(lageFor(undefined)).toBe('okant')
  })

  it('en slutredovisningsrad på en faktura utan kontraktsnummer kopplas inte till någon trakt', () => {
    // 23 äldre fakturor (jan–apr 2026) saknar artikel 8. De får aldrig göra en
    // trakt slutredovisad på gissning.
    const l = byggFakturaLage(
      [{ vo_nummer: 'x', kontraktsnummer: '969829' }],
      [rad({ document_number: 2026086, article_number: '7', description: 'Slutredovisning' })],
    )
    expect(lageFor(l['x'])).toBe('ofakturerat')
  })

  it('samma faktura räknas en gång även om numret står på två rader', () => {
    const l = byggFakturaLage(
      [{ vo_nummer: 'x', kontraktsnummer: '968539' }],
      [rad({ document_number: 2026181 }), rad({ document_number: 2026181 })],
    )
    expect(l['x'].fakturor).toHaveLength(1)
  })

  it('en rad utan fakturanummer hoppas över i stället för att bli en faktura utan identitet', () => {
    const l = byggFakturaLage(
      [{ vo_nummer: 'x', kontraktsnummer: '968539' }],
      [rad({ document_number: null })],
    )
    expect(lageFor(l['x'])).toBe('ofakturerat')
  })

  it('en trakt utan vo_nummer kommer inte med i kartan', () => {
    expect(Object.keys(byggFakturaLage([{ vo_nummer: null, kontraktsnummer: '1' }], []))).toEqual([])
  })
})
