import { describe, it, expect } from 'vitest'
import { byggMaskinkort, maskinNamn, rollFor, type MaskinRad } from './traktVy'
import type { Tillaggspost } from '@/lib/ekonomi/prisPerM3'

// FACIT: Brokamåla 15 V-H avd 20 -25, VO 11226833, faktura 2026140.
// Prislistan ger klass 0,60 = 100,00 (skördare 56,00 · skotare 44,00).
// Traktens tillägg: krönt +1,50 (skördaren), traktstorlek −1,00 (delas),
// terräng +2,00 (skotaren) = 2,50. Appens förslag 1,00 / 1,50; Martin satte
// skördarens andel till 2,00, alltså en krona flyttad.
//   skördaren 56,00 +1,50 −0,50 +1,00            = 58,00
//   skotaren  44,00 +2,00 −0,50 −1,00 +12,00     = 56,50
// × 2 186,79 m³fub = 126 834 + 123 554 = 250 387 kr.

const poster: Tillaggspost[] = [
  { etikett: 'Krönt', belopp: 1.5, mottagare: 'skordare' },
  { etikett: 'Traktstorlek', belopp: -1, mottagare: 'delas' },
  { etikett: 'Terräng', belopp: 2, mottagare: 'skotare' },
]

const skordare: MaskinRad = {
  artikelnr: '1', benamning: 'Skördning ackord Ponsse Scorpion', antal: 2186.79,
  kostnadsstalle: 'SCO', a_pris_beraknat: 58, delar_grundpris: 56,
  delar_andel: 2, delar_avstand: null, tillaggsposter: poster,
  harledning: [{ etikett: 'Grund (medelstam 0,69 → 0,6)', belopp: 100 }],
}
const skotare: MaskinRad = {
  artikelnr: '2', benamning: 'Skotning ackord Wisent', antal: 2186.79,
  kostnadsstalle: 'M14', a_pris_beraknat: 56.5, delar_grundpris: 44,
  delar_andel: 0.5, delar_avstand: 12, tillaggsposter: poster,
  harledning: [{ etikett: 'Grund (medelstam 0,69 → 0,6)', belopp: 100 }],
}

const summa = (k: ReturnType<typeof byggMaskinkort>) =>
  Math.round(k.rader.reduce((s, r) => s + r.belopp, 0) * 100) / 100

describe('byggMaskinkort — varje rad säger vad den är', () => {
  it('skördaren: krönt helt hit, traktstorleken halv, och den flyttade kronan namngiven', () => {
    const k = byggMaskinkort(skordare)
    expect(k.rader.map(r => r.etikett)).toEqual([
      'Grundpris, klass 0,6',
      'Krönt, hela till skördaren',
      'Traktstorlek, hälften av −1,00',
      'Tillägg du flyttade från skotaren',
    ])
    expect(k.rader.map(r => r.belopp)).toEqual([56, 1.5, -0.5, 1])
  })

  it('skotaren: terrängen helt hit, samma krona åt andra hållet, avståndet sist', () => {
    const k = byggMaskinkort(skotare)
    expect(k.rader.map(r => r.etikett)).toEqual([
      'Grundpris, klass 0,6',
      'Terräng, hela till skotaren',
      'Traktstorlek, hälften av −1,00',
      'Tillägg du flyttade till skördaren',
      'Skotningsavstånd',
    ])
    expect(k.rader.map(r => r.belopp)).toEqual([44, 2, -0.5, -1, 12])
  })

  it('KOLUMNEN SUMMERAR TILL À-PRISET — det går att räkna ihop med miniräknare', () => {
    expect(summa(byggMaskinkort(skordare))).toBe(58)
    expect(summa(byggMaskinkort(skotare))).toBe(56.5)
  })

  it('summan per maskin är fakturans', () => {
    expect(Math.round(byggMaskinkort(skordare).summa!)).toBe(126834)
    expect(Math.round(byggMaskinkort(skotare).summa!)).toBe(123554)
  })

  it('utan överskrivning finns ingen flyttad-rad, och kolumnen summerar ändå', () => {
    // Appens förslag: skördaren 1,50 − 0,50 = 1,00 → 57,00
    const k = byggMaskinkort({ ...skordare, delar_andel: 1, a_pris_beraknat: 57 })
    expect(k.rader.map(r => r.etikett)).not.toContain('Tillägg du flyttade från skotaren')
    expect(summa(k)).toBe(57)
  })

  it('en post på noll får ingen rad', () => {
    const k = byggMaskinkort({
      ...skordare,
      tillaggsposter: [{ etikett: 'Krönt', belopp: 0, mottagare: 'skordare' }],
      delar_andel: 0, a_pris_beraknat: 56,
    })
    expect(k.rader).toHaveLength(1)
  })
})

describe('byggMaskinkort — timpeng', () => {
  const timpeng: MaskinRad = {
    artikelnr: '11', benamning: 'Skördning timpeng H8E -26', antal: 16.06,
    kostnadsstalle: 'M12', a_pris_beraknat: 1265, delar_grundpris: 1265,
    delar_andel: null, delar_avstand: null, tillaggsposter: null, harledning: null,
  }

  it('har bara timpriset — inga tillägg, inget avstånd', () => {
    const k = byggMaskinkort(timpeng)
    expect(k.rader).toEqual([{ etikett: 'Timpris', belopp: 1265, tecken: false }])
    expect(k.prisEtikett).toBe('Pris per timme')
    expect(k.antalEnhet).toBe('tim')
    expect(Math.round(k.summa!)).toBe(20316)
  })

  it('kostnadsställe som saknas sägs, aldrig tomt', () => {
    expect(byggMaskinkort({ ...timpeng, kostnadsstalle: null }).etikett)
      .toBe('Skördning · kostnadsställe saknas')
  })

  it('ett kostnadsställe som FINNS står inte i rubriken', () => {
    // "Skördning · kostnadsställe SCO" är fyra ord Fortnox behöver och
    // människan inte. Rubriken säger vad kortet är, inget mer.
    expect(byggMaskinkort(timpeng).etikett).toBe('Skördning')
    expect(byggMaskinkort(skordare).etikett).toBe('Skördning')
    expect(byggMaskinkort(skotare).etikett).toBe('Skotning')
  })
})

describe('byggMaskinkort — skotningsavståndet i meter', () => {
  it('skriver metrarna på raden när de är kända', () => {
    const k = byggMaskinkort(skotare, 450)
    expect(k.rader.map(r => r.etikett)).toContain('Skotningsavstånd, 450 m')
  })

  it('avrundar till hel meter och skriver tusental som i resten av appen', () => {
    // Tusentalsavgränsaren är ett smalt hårt mellanslag — normaliseras som i
    // granskningens tester, annars provar testet typografi och inte regeln.
    const txt = (s: string) => s.replace(/[  ]/g, ' ')
    expect(byggMaskinkort(skotare, 1538.4).rader.map(r => txt(r.etikett)))
      .toContain('Skotningsavstånd, 1 538 m')
  })

  it('utan kända meter står raden som förut — aldrig ett påhittat tal', () => {
    for (const utan of [undefined, null]) {
      expect(byggMaskinkort(skotare, utan).rader.map(r => r.etikett))
        .toContain('Skotningsavstånd')
    }
  })

  it('kronorna är orörda — metrarna är text, inte en ny uträkning', () => {
    expect(summa(byggMaskinkort(skotare, 450))).toBe(56.5)
    expect(byggMaskinkort(skotare, 450).rader.find(r => r.etikett.startsWith('Skotningsavstånd'))!.belopp)
      .toBe(12)
  })

  it('skördaren har ingen avståndsrad, så metrarna syns inte där', () => {
    expect(byggMaskinkort(skordare, 450).rader.map(r => r.etikett).join(' '))
      .not.toContain('Skotningsavstånd')
  })
})

describe('maskinNamn', () => {
  it('tar visningsnamn när radbyggaren skickar det', () => {
    expect(maskinNamn({ ...skordare, visningsnamn: 'Giant' })).toBe('Giant')
  })
  it('faller tillbaka på benämningen utan verb och avtalsform', () => {
    expect(maskinNamn(skordare)).toBe('Ponsse Scorpion')
  })
  it('en omskriven benämning går inte sönder — hela texten används', () => {
    expect(maskinNamn({ ...skordare, benamning: 'Wisent' })).toBe('Wisent')
  })
})

describe('rollFor', () => {
  it('artikel 1 och 11 är skördning, 2 och 12 skotning', () => {
    expect(rollFor('1')).toBe('skordare')
    expect(rollFor('11')).toBe('skordare')
    expect(rollFor('2')).toBe('skotare')
    expect(rollFor('12')).toBe('skotare')
  })
})

// POTTMENINGEN ÄR BORTTAGEN 2026-11-20 — allt den sa stod redan som namngivna
// rader i korten ovanför, och den var sidans längsta text. Det som den ensam
// bar, den flyttade kronan, har en egen rad sedan 2026-10-24 och provas i
// "skördaren: … den flyttade kronan namngiven" ovan.
