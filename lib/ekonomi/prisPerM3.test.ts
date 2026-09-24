import { describe, it, expect } from 'vitest'
import { prisPerM3 } from './prisPerM3'
import { lookupAcordPris, type AcordPris } from './acord'

// Avtalets prislista (Vida, slutavverkning 45811) — samma nio klasser som
// acord_priser i prod.
const ACORD: AcordPris[] = [
  { medelstam: 0.20, pris_total: 130, pris_skordare: 81, pris_skotare: 49, giltig_fran: null, giltig_till: null },
  { medelstam: 0.25, pris_total: 123, pris_skordare: 76, pris_skotare: 47, giltig_fran: null, giltig_till: null },
  { medelstam: 0.30, pris_total: 117, pris_skordare: 72, pris_skotare: 45, giltig_fran: null, giltig_till: null },
  { medelstam: 0.35, pris_total: 113, pris_skordare: 69, pris_skotare: 44, giltig_fran: null, giltig_till: null },
  { medelstam: 0.40, pris_total: 107, pris_skordare: 65, pris_skotare: 42, giltig_fran: null, giltig_till: null },
  { medelstam: 0.45, pris_total: 104, pris_skordare: 63, pris_skotare: 41, giltig_fran: null, giltig_till: null },
  { medelstam: 0.50, pris_total: 103, pris_skordare: 62, pris_skotare: 41, giltig_fran: null, giltig_till: null },
  { medelstam: 0.55, pris_total: 101, pris_skordare: 60, pris_skotare: 41, giltig_fran: null, giltig_till: null },
  { medelstam: 0.60, pris_total: 100, pris_skordare: 56, pris_skotare: 44, giltig_fran: null, giltig_till: null },
]

/** Exakt den aritmetik EkonomiClient och objektJamforelse hade FÖRE flytten. */
function gammalKrPerM3(
  roll: 'skordare' | 'skotare',
  medelstam: number,
  sortKr: number, traktKr: number, kvalitetKr: number, terrangKr: number,
): number {
  const grundpris = lookupAcordPris(medelstam, ACORD)?.[roll === 'skordare' ? 'pris_skordare' : 'pris_skotare'] || 0
  const ovrigKr = kvalitetKr + terrangKr           // ovrigKrFor / objOvrigKr
  const extra = sortKr + traktKr + ovrigKr
  return grundpris + extra
}

describe('prisPerM3 är ett no-op mot den gamla aritmetiken', () => {

  it('identiskt på BIT-nivå över hela matrisen — inte "ungefär lika"', () => {
    const medelstammar = [0.18, 0.2, 0.23, 0.35, 0.4, 0.55, 0.6, 0.807, 1.2]
    const sortiment    = [0, 2, 4, 6]
    const trakt        = [-2, -1, 0, 2, 4, 5]
    const kvalitet     = [0, 1.5, 2]
    const terrang      = [0, 1, 4, 8]
    let fall = 0
    for (const roll of ['skordare', 'skotare'] as const)
      for (const ms of medelstammar)
        for (const s of sortiment)
          for (const t of trakt)
            for (const k of kvalitet)
              for (const te of terrang) {
                const gammal = gammalKrPerM3(roll, ms, s, t, k, te)
                const ny = prisPerM3({
                  roll, medelstam: ms, acordList: ACORD,
                  sortKr: s, traktKr: t, kvalitetKr: k, terrangKr: te,
                }).krPerM3
                // Object.is, inte toBeCloseTo: flyttalsaddition är inte
                // associativ, så en omkastad summeringsordning hade gett
                // skillnader i sista biten som toBeCloseTo döljer.
                expect(Object.is(ny, gammal)).toBe(true)
                fall++
              }
    expect(fall).toBe(2 * 9 * 4 * 6 * 3 * 4)
  })

  it('avståndet ingår ALDRIG i krPerM3 — bara i härledningen', () => {
    const utan = prisPerM3({ roll: 'skotare', medelstam: 0.6, acordList: ACORD, sortKr: 0, traktKr: 0, kvalitetKr: 1.5, terrangKr: 0 })
    const med  = prisPerM3({ roll: 'skotare', medelstam: 0.6, acordList: ACORD, sortKr: 0, traktKr: 0, kvalitetKr: 1.5, terrangKr: 0,
                             avstand: { kr: 16000, volym: 1000, enhetligtSteg: false } })
    expect(med.krPerM3).toBe(utan.krPerM3)
    expect(med.delar.find(d => d.etikett === 'Avstånd')?.belopp).toBe(16)
    expect(med.delar.find(d => d.etikett === 'Avstånd')?.ungefarlig).toBe(true)
  })

  it('delarna summerar till krPerM3 när avståndet inte är med', () => {
    const p = prisPerM3({ roll: 'skordare', medelstam: 0.807, acordList: ACORD, sortKr: 2, traktKr: 2, kvalitetKr: 1.5, terrangKr: 0 })
    const summa = p.delar.reduce((s, d) => s + d.belopp, 0)
    expect(summa).toBeCloseTo(p.krPerM3, 10)
  })
})

describe('klass bär tolkningen som saknar avtalsstöd', () => {

  it('medelstam över prislistans tak slås upp på närmaste klass, och det syns', () => {
    // Åbogen: 0,807 prissatt på 0,60-raden. Avtalets tabell slutar vid 0,60 och
    // säger ingenting däröver — "närmaste klass" är en TOLKNING, inte en regel.
    const p = prisPerM3({ roll: 'skordare', medelstam: 0.807, acordList: ACORD, sortKr: 2, traktKr: 2, kvalitetKr: 1.5, terrangKr: 0 })
    expect(p.klass).toBe(0.6)
    expect(p.delar[0].etikett).toContain('0,81')
    expect(p.delar[0].etikett).toContain('0,6')
  })

  it('exakt träff på en klass visar inte någon pil', () => {
    const p = prisPerM3({ roll: 'skordare', medelstam: 0.6, acordList: ACORD, sortKr: 0, traktKr: 0, kvalitetKr: 0, terrangKr: 0 })
    expect(p.delar[0].etikett).not.toContain('→')
  })

  it('Åbogens skördningspris reproduceras: 56 + 1,5 + 2 + 2 = 61,50', () => {
    // Faktura 2026142: "Skördning Gigant 700 m3fub à 61,50" med härledningen
    // Medel 0,8 / Krönt +1,5kr / Storlek +2kr / Blött +2kr.
    const p = prisPerM3({
      roll: 'skordare', medelstam: 0.807, acordList: ACORD,
      sortKr: 0, traktKr: 2, kvalitetKr: 1.5, terrangKr: 2,
    })
    expect(p.krPerM3).toBe(61.5)
    expect(p.delar.map(d => d.etikett)).toEqual([
      'Grund (medelstam 0,81 → 0,6)', 'Krönt', 'Storlek', 'Terräng',
    ])
  })

  it('tom prislista ger 0 och klass null — aldrig ett gissat pris', () => {
    const p = prisPerM3({ roll: 'skordare', medelstam: 0.5, acordList: [], sortKr: 0, traktKr: 0, kvalitetKr: 0, terrangKr: 0 })
    expect(p.krPerM3).toBe(0)
    expect(p.klass).toBeNull()
  })
})
