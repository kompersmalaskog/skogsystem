import { describe, it, expect } from 'vitest'
import { byggFattas, fattasRubrik, TACKNING_KRAV, type FattasIndata } from './fattas'

/**
 * toLocaleString('sv-SE') skiljer tusental med HÅRT blanksteg (U+00A0). Proven
 * skrivs med vanligt blanksteg och jämförs normaliserat — annars faller de på
 * ett tecken ingen ser, och nästa läsare tror att talet är fel.
 */
const sp = (s: string | null) => (s == null ? null : s.replace(/ /g, ' '))

/** Grunden: en trakt där ingenting fattas. Varje prov ändrar EN sak. */
const helt = (): FattasIndata => ({
  timpeng: false,
  kontraktsnummer: '969670',
  volymM3fub: 1000,
  terrangKr: 2,
  avstand: { manuellt: 450, lassVolym: 1000, lassAntal: 40, kronor: 8000 },
  sortiment: { manuellt: true, anvant: 6, raknat: 7, grundantal: 6, krPerExtra: 2 },
})

describe('en trakt där allt är ifyllt har inget att kolla', () => {
  it('tom lista', () => {
    expect(byggFattas(helt())).toEqual([])
  })

  it('Brokamåla, prods enda helt ifyllda ackordtrakt: terräng 2, avstånd 450, sortiment satt', () => {
    const brokamala: FattasIndata = {
      timpeng: false, kontraktsnummer: '972114', volymM3fub: 2186.79, terrangKr: 2,
      avstand: { manuellt: 450, lassVolym: 1158, lassAntal: 58, kronor: 26241 },
      sortiment: { manuellt: true, anvant: 6, raknat: 7, grundantal: 6, krPerExtra: 2 },
    }
    expect(byggFattas(brokamala)).toEqual([])
  })
})

describe('Skälviken RP J-Hus -25 — trakten som ska faktureras 2026-11-16', () => {
  // Prod 2026-11-16: 1 725,2 m³ skördat, TVÅ lass med körsträcka (858 och
  // 1 538 m enkel väg) som bär 20 m³ var. Appen räknar 1 680 kr.
  const skalviken = (): FattasIndata => ({
    timpeng: false,
    kontraktsnummer: '969670',
    volymM3fub: 1725.2,
    terrangKr: 0,
    avstand: { manuellt: null, lassVolym: 40, lassAntal: 2, kronor: 1680 },
    sortiment: { manuellt: false, anvant: 7, raknat: 7, grundantal: 6, krPerExtra: 2 },
  })

  it('tre saker att kolla, i fast ordning: avstånd, terräng, sortiment', () => {
    const p = byggFattas(skalviken())
    expect(p.map(x => x.nyckel)).toEqual(['avstand', 'terrang', 'sortiment'])
    expect(fattasRubrik(p)).toBe('3 saker att kolla')
  })

  it('avståndet säger TÄCKNINGEN och vad tillägget blev — 2 %, 0,97 kr/m³', () => {
    const a = byggFattas(skalviken()).find(x => x.nyckel === 'avstand')!
    expect(a.rubrik).toBe('Skotningsavståndet bygger på 2 % av volymen')
    expect(a.text).toContain('2 lass')
    expect(sp(a.text)).toContain('40 m³fub av 1 725 m³fub')
    expect(sp(a.varde)).toBe('0,97 kr/m³fub · 1 680 kr')
    expect(a.ark).toBe('avstand')
  })

  it('sortimentet bär kronorna hela trakten: +2,00 kr/m³fub = 3 450 kr', () => {
    const s = byggFattas(skalviken()).find(x => x.nyckel === 'sortiment')!
    expect(s.rubrik).toBe('Appen räknar 7 sortiment')
    expect(s.text).toBe('1 över de 6 som ingår i priset. Stämmer det?')
    expect(sp(s.varde)).toBe('+2,00 kr/m³fub · 3 450 kr')
    expect(s.ark).toBe('sortiment')
  })

  it('terrängen FRÅGAR, den påstår inte att något är fel', () => {
    const t = byggFattas(skalviken()).find(x => x.nyckel === 'terrang')!
    expect(t.rubrik).toBe('Terrängtillägget är 0 kr')
    expect(t.text).toContain('Är marken normal?')
  })
})

describe('lassens täckning avgör, inte om lass finns', () => {
  const med = (lassVolym: number, lassAntal = 10): FattasIndata => ({
    ...helt(),
    terrangKr: 2,
    avstand: { manuellt: null, lassVolym, lassAntal, kronor: 5000 },
    sortiment: { ...helt().sortiment, manuellt: true },
  })

  // Uppmätt på prods tolv klara ackordtrakter 2026-11-16.
  it.each([
    ['Åbogen', 0, true],
    ['Skälviken', 20, true],
    ['Mölleryd', 190, true],
    ['Brokamåla utan manuell siffra', 530, true],
    ['Stänkelsmåla', 670, true],
    ['Östra-Hoka', 900, false],
    ['Kämpamåla', 990, false],
    ['Bågskyttebanan', 1000, false],
    ['Rävemåla, mer lass än skördat', 1020, false],
  ])('%s: %i m³ av 1000 → varnar %s', (_namn, lassVolym, varnar) => {
    const p = byggFattas(med(lassVolym, lassVolym === 0 ? 0 : 10))
    expect(p.some(x => x.nyckel === 'avstand')).toBe(varnar)
  })

  it('exakt på gränsen duger — 80 % varnar inte', () => {
    expect(byggFattas(med(TACKNING_KRAV * 1000)).some(x => x.nyckel === 'avstand')).toBe(false)
    expect(byggFattas(med(TACKNING_KRAV * 1000 - 1)).some(x => x.nyckel === 'avstand')).toBe(true)
  })

  it('INGA lass är en egen text — "0 kr", inte "bygger på 0 %"', () => {
    const a = byggFattas(med(0, 0)).find(x => x.nyckel === 'avstand')!
    expect(a.rubrik).toBe('Skotningsavståndet är inte satt')
    expect(a.varde).toBe('0 kr')
  })

  it('ett enda lass heter "Ett lass", inte "1 lass"', () => {
    const a = byggFattas(med(20, 1)).find(x => x.nyckel === 'avstand')!
    expect(a.text).toContain('Ett lass')
  })

  it('en satt siffra är ett SVAR — ingen post, hur tunna lassen än är', () => {
    const p = byggFattas({ ...med(0, 0), avstand: { manuellt: 300, lassVolym: 0, lassAntal: 0, kronor: 0 } })
    expect(p.some(x => x.nyckel === 'avstand')).toBe(false)
  })
})

describe('timpeng har varken avstånd eller terräng', () => {
  it('bara sortimentet frågas', () => {
    const p = byggFattas({
      ...helt(),
      timpeng: true,
      terrangKr: 0,
      avstand: { manuellt: null, lassVolym: 0, lassAntal: 0, kronor: 0 },
      sortiment: { ...helt().sortiment, manuellt: false, anvant: 7 },
    })
    expect(p.map(x => x.nyckel)).toEqual(['sortiment'])
  })
})

describe('sortimentet frågas även när det inte kostar något', () => {
  it('under grundantalet: appens 5 kan vara 7 i verkligheten', () => {
    const s = byggFattas({
      ...helt(),
      sortiment: { manuellt: false, anvant: 5, raknat: 5, grundantal: 6, krPerExtra: 2 },
    }).find(x => x.nyckel === 'sortiment')!
    expect(s.rubrik).toBe('Appen räknar 5 sortiment')
    expect(s.text).toContain('Alla 5 ingår i priset')
    expect(s.varde).toBe('0 kr')
  })

  it('exakt på grundantalet: 6 av 6 ingår, och värdet är 0 kr — aldrig "+0,00 kr/m³fub"', () => {
    const s = byggFattas({
      ...helt(),
      sortiment: { manuellt: false, anvant: 6, raknat: 6, grundantal: 6, krPerExtra: 2 },
    }).find(x => x.nyckel === 'sortiment')!
    expect(s.text).toContain('Alla 6 ingår i priset')
    expect(s.varde).toBe('0 kr')
  })

  it('ingen sats i prislistan sägs rakt ut, och värdet är inget påhittat tal', () => {
    const s = byggFattas({
      ...helt(),
      sortiment: { manuellt: false, anvant: 9, raknat: 9, grundantal: null, krPerExtra: null },
    }).find(x => x.nyckel === 'sortiment')!
    expect(s.text).toContain('Ingen sats i prislistan')
    expect(s.varde).toBeNull()
  })
})

describe('kontraktsnummer', () => {
  it('Anders Ingemarsson RP ATA saknar det — posten sist, efter prisuppgifterna', () => {
    const p = byggFattas({ ...helt(), kontraktsnummer: null, terrangKr: 0 })
    expect(p.map(x => x.nyckel)).toEqual(['terrang', 'kontraktsnr'])
    expect(p[1].rubrik).toBe('Kontraktsnummer saknas')
    expect(p[1].text).toContain('artikel 8')
  })
})

describe('rubriken', () => {
  it('1 sak, inte "1 saker"', () => {
    expect(fattasRubrik([{ nyckel: 'terrang', rubrik: '', text: '', varde: null, ark: null }]))
      .toBe('1 sak att kolla')
  })
})
