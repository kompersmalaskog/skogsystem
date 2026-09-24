import { describe, it, expect } from 'vitest'
import { prisPerM3 } from './prisPerM3'
import {
  isValidOn, lookupAcordPris, traktTillagg, sortimentTillagg,
  type AcordPris, type TraktBracket, type SortConfig, type OvrigtRad,
} from './acord'

// Avtalets prislista (Vida, slutavverkning 45811), backdaterad till
// avtalsdatum i #570 — samma nio klasser och sex traktspann som i prod.
const FRAN = '2025-06-03'
const g = { giltig_fran: FRAN, giltig_till: null as string | null }

const ACORD: (AcordPris & typeof g)[] = [
  { medelstam: 0.20, pris_total: 130, pris_skordare: 81, pris_skotare: 49, ...g },
  { medelstam: 0.25, pris_total: 123, pris_skordare: 76, pris_skotare: 47, ...g },
  { medelstam: 0.30, pris_total: 117, pris_skordare: 72, pris_skotare: 45, ...g },
  { medelstam: 0.35, pris_total: 113, pris_skordare: 69, pris_skotare: 44, ...g },
  { medelstam: 0.40, pris_total: 107, pris_skordare: 65, pris_skotare: 42, ...g },
  { medelstam: 0.45, pris_total: 104, pris_skordare: 63, pris_skotare: 41, ...g },
  { medelstam: 0.50, pris_total: 103, pris_skordare: 62, pris_skotare: 41, ...g },
  { medelstam: 0.55, pris_total: 101, pris_skordare: 60, pris_skotare: 41, ...g },
  { medelstam: 0.60, pris_total: 100, pris_skordare: 56, pris_skotare: 44, ...g },
]
const TRAKT: (TraktBracket & typeof g)[] = [
  { fran_m3fub: 0,    till_m3fub: 200,  tillagg_kr_per_m3fub: 5,  ...g },
  { fran_m3fub: 200,  till_m3fub: 400,  tillagg_kr_per_m3fub: 4,  ...g },
  { fran_m3fub: 400,  till_m3fub: 800,  tillagg_kr_per_m3fub: 2,  ...g },
  { fran_m3fub: 800,  till_m3fub: 1500, tillagg_kr_per_m3fub: 0,  ...g },
  { fran_m3fub: 1500, till_m3fub: 2500, tillagg_kr_per_m3fub: -1, ...g },
  { fran_m3fub: 2500, till_m3fub: null, tillagg_kr_per_m3fub: -2, ...g },
]
const SORT: (SortConfig & typeof g)[] = [{ grundantal: 6, kr_per_extra_sortiment: 2, ...g }]
const OVRIGT: OvrigtRad[] = [
  { nyckel: 'kvalitetssakring', varde: 1.5, giltig_fran: FRAN, giltig_till: null },
  { nyckel: 'massa_3m_tillagg', varde: 10,  giltig_fran: FRAN, giltig_till: null },
]
const DATUM = '2026-08-10'   // Åbogens avräkningsdag

/** Exakt den aritmetik EkonomiClient och objektJamforelse hade FÖRE flytten. */
function gammalKrPerM3(
  roll: 'skordare' | 'skotare', medelstam: number,
  volym: number, grupper: number, terrangKr: number,
): number {
  const grundpris = lookupAcordPris(medelstam, ACORD)?.[roll === 'skordare' ? 'pris_skordare' : 'pris_skotare'] || 0
  const sortKr = sortimentTillagg(grupper, SORT[0])
  const traktKr = traktTillagg(volym, TRAKT).krPerM3
  const kvalitetKr = Number(OVRIGT.find(r => r.nyckel === 'kvalitetssakring')!.varde)
  const ovrigKr = kvalitetKr + terrangKr           // ovrigKrFor / objOvrigKr
  return grundpris + (sortKr + traktKr + ovrigKr)
}

describe('prisPerM3 är ett no-op mot den gamla aritmetiken', () => {

  it('identiskt på BIT-nivå över hela matrisen — inte "ungefär lika"', () => {
    const medelstammar = [0.18, 0.2, 0.23, 0.35, 0.4, 0.55, 0.6, 0.807, 1.2]
    const volymer      = [120, 300, 742, 1000, 2000, 3000]   // ett per traktspann
    const grupper      = [4, 6, 7, 8, 9]
    const terrang      = [0, 1, 4, 8]
    let fall = 0
    for (const roll of ['skordare', 'skotare'] as const)
      for (const ms of medelstammar)
        for (const v of volymer)
          for (const grp of grupper)
            for (const te of terrang) {
              const gammal = gammalKrPerM3(roll, ms, v, grp, te)
              const ny = prisPerM3({
                roll, medelstam: ms, datum: DATUM,
                acordList: ACORD, traktBrackets: TRAKT, sortConfList: SORT, ovrigtList: OVRIGT,
                sortimentgrupper: grp, volymM3fub: v, terrangKr: te,
              }).krPerM3
              // Object.is, inte toBeCloseTo: flyttalsaddition är inte
              // associativ, så en omkastad summeringsordning hade gett
              // skillnader i sista biten som toBeCloseTo döljer.
              expect(Object.is(ny, gammal)).toBe(true)
              fall++
            }
    expect(fall).toBe(2 * 9 * 6 * 5 * 4)
  })

  it('avståndet ingår ALDRIG i krPerM3 — bara i härledningen', () => {
    const bas = { roll: 'skotare' as const, medelstam: 0.6, datum: DATUM,
      acordList: ACORD, traktBrackets: TRAKT, sortConfList: SORT, ovrigtList: OVRIGT,
      sortimentgrupper: 6, volymM3fub: 1000, terrangKr: 0 }
    const utan = prisPerM3(bas)
    const med  = prisPerM3({ ...bas, avstand: { kr: 16000, volym: 1000, enhetligtSteg: false } })
    expect(med.krPerM3).toBe(utan.krPerM3)
    expect(med.delar.find(d => d.etikett === 'Avstånd')?.belopp).toBe(16)
    expect(med.delar.find(d => d.etikett === 'Avstånd')?.ungefarlig).toBe(true)
  })
})

describe('ingen fallback — en sats som saknas är ett TILLSTÅND', () => {

  it('datum före taxornas giltighet ger 0 OCH listar allt i saknas', () => {
    // Källornas tidigaste datum är 2023-02-24 (fakt_tid/arbetsdag). Taxorna
    // gäller från 2025-06-03. Förr föll ovrigtKrPerM3 tillbaka på första raden
    // och returnerade 1,50 ändå — ett tal som såg rimligt ut för ett datum där
    // ingen sats gällde.
    const p = prisPerM3({
      roll: 'skordare', medelstam: 0.5, datum: '2023-02-24',
      acordList: ACORD, traktBrackets: TRAKT, sortConfList: SORT, ovrigtList: OVRIGT,
      sortimentgrupper: 8, volymM3fub: 742, terrangKr: 0,
    })
    expect(p.krPerM3).toBe(0)
    expect(p.klass).toBeNull()
    expect(p.saknas.sort()).toEqual(['grundpris', 'kvalitet', 'sortiment', 'trakt'])
  })

  it('saknas är TOM när allt hittas — 0 kr är inte samma sak som ingen sats', () => {
    // Traktspannet 800–1500 ÄR 0 kr. Det får aldrig förväxlas med "sats saknas".
    const p = prisPerM3({
      roll: 'skordare', medelstam: 0.6, datum: DATUM,
      acordList: ACORD, traktBrackets: TRAKT, sortConfList: SORT, ovrigtList: OVRIGT,
      sortimentgrupper: 6, volymM3fub: 1000, terrangKr: 0,
    })
    expect(p.saknas).toEqual([])
    expect(p.delar.find(d => d.etikett === 'Storlek')).toBeUndefined()  // 0 kr → ingen post
    expect(p.krPerM3).toBe(57.5)                                        // 56 + 1,5
  })

  it('datumet väljer GENERATION när två finns — inte sorteringsordningen', () => {
    const gammalGen: (AcordPris & typeof g)[] = [
      { medelstam: 0.60, pris_total: 90, pris_skordare: 50, pris_skotare: 40,
        giltig_fran: '2024-01-01', giltig_till: '2025-06-02' },
    ]
    const bada = [...gammalGen, ...ACORD]
    const bas = { roll: 'skordare' as const, medelstam: 0.6,
      acordList: bada, traktBrackets: TRAKT, sortConfList: SORT, ovrigtList: OVRIGT,
      sortimentgrupper: 6, volymM3fub: 1000, terrangKr: 0 }
    // Gamla generationen först i listan — utan datumfilter hade lookupAcordPris
    // kunnat välja den. Det är precis minan som stängs här.
    expect(prisPerM3({ ...bas, datum: '2024-06-01' }).krPerM3).toBe(50)
    expect(prisPerM3({ ...bas, datum: DATUM }).krPerM3).toBe(57.5)
  })
})

describe('klass bär tolkningen som saknar avtalsstöd', () => {

  it('medelstam över prislistans tak slås upp på närmaste klass, och det syns', () => {
    const p = prisPerM3({
      roll: 'skordare', medelstam: 0.807, datum: DATUM,
      acordList: ACORD, traktBrackets: TRAKT, sortConfList: SORT, ovrigtList: OVRIGT,
      sortimentgrupper: 4, volymM3fub: 742, terrangKr: 0,
    })
    expect(p.klass).toBe(0.6)
    expect(p.delar[0].etikett).toContain('0,81')
    expect(p.delar[0].etikett).toContain('0,6')
  })

  it('Åbogen ur APPENS data ger 59,50 — fakturans 61,50 innehåller en manuell post', () => {
    // Objekt 11217413, verifierat mot prod 2026-09-24:
    //   medelstam 742/919 = 0,807  → klass 0,60 → pris_skordare 56
    //   sortimentgrupper 4 av grundantal 6      → 0 kr
    //   742 m³fub i traktspannet 400–800        → 2 kr
    //   kvalitetssäkring (avräkning 2026-08-10) → 1,5 kr
    //   terrang_kr_manuell = NULL               → 0 kr
    const bas = { roll: 'skordare' as const, medelstam: 0.807, datum: DATUM,
      acordList: ACORD, traktBrackets: TRAKT, sortConfList: SORT, ovrigtList: OVRIGT,
      sortimentgrupper: 4, volymM3fub: 742 }
    const p = prisPerM3({ ...bas, terrangKr: 0 })
    expect(p.krPerM3).toBe(59.5)
    expect(p.delar.map(d => d.etikett)).toEqual([
      'Grund (medelstam 0,81 → 0,6)', 'Krönt', 'Storlek',
    ])

    // Faktura 2026142 säger 61,50 med textraden "Blött +2kr". De två kronorna
    // finns INTE i appens data — de är Martins bedömning av förhållandena, och
    // avtalets terrängspann är 1–8 kr/m³fub, alltså ett val och inte en formel.
    // Endast TVÅ objekt i hela databasen har terrang_kr_manuell satt, och
    // Åbogen är inte ett av dem.
    //
    // Skillnaden ska bäras som en MANUELL POST i fakturaunderlaget, inte
    // tryckas in i ackordspriset — annars försvinner två kronor per kubik tyst
    // på varje svår trakt. Testet låser fast gapet så att den dagen någon "får"
    // 61,50 ur koden är det för att posten byggts, inte för att ett värde
    // smugit in i formeln.
    const medTerrang = prisPerM3({ ...bas, terrangKr: 2 })
    expect(medTerrang.krPerM3).toBe(61.5)
    expect(medTerrang.krPerM3 - p.krPerM3).toBe(2)
  })
})
