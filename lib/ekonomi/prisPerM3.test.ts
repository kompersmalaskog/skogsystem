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

/** Aritmetiken EkonomiClient och objektJamforelse hade FÖRE rättelsen:
 *  rollens grundpris PLUS HELA tillägget — på varje roll. */
function gammalKrPerM3(
  roll: 'skordare' | 'skotare',
  medelstam: number,
  sortKr: number, traktKr: number, kvalitetKr: number, terrangKr: number,
): number {
  const grundpris = lookupAcordPris(medelstam, ACORD)?.[roll === 'skordare' ? 'pris_skordare' : 'pris_skotare'] || 0
  return grundpris + (sortKr + traktKr + (kvalitetKr + terrangKr))
}

describe('rättelsen är en AVSIKTLIG ändring — och skillnaden är exakt tillägget', () => {

  it('gamla formeln gav pris_total + 2×tillägg, nya ger pris_total + tillägg', () => {
    // Det här testet ersätter no-op-beviset från 1a. Då var kravet att
    // ingenting fick ändras; nu SKA tal ändras, och kravet är att ändringen
    // är exakt den påstådda — inte "ungefär mindre".
    const medelstammar = [0.18, 0.2, 0.23, 0.35, 0.4, 0.55, 0.6, 0.807, 1.2]
    const sortiment    = [0, 2, 4, 6]
    const trakt        = [-2, -1, 0, 2, 4, 5]
    const kvalitet     = [0, 1.5, 2]
    const terrang      = [0, 1, 4, 8]
    let fall = 0
    const ore = (n: number) => Math.round(n * 100)
    for (const ms of medelstammar)
      for (const so of sortiment)
        for (const t of trakt)
          for (const k of kvalitet)
            for (const te of terrang) {
              const arg = { medelstam: ms, acordList: ACORD, sortKr: so, traktKr: t, kvalitetKr: k, terrangKr: te }
              const nySk  = prisPerM3({ roll: 'skordare', ...arg })
              const nySko = prisPerM3({ roll: 'skotare',  ...arg })
              const ovrigt = so + t + k + te

              // 1. De två rollerna summerar till pris_total + tillägget, EN gång.
              expect(ore(nySk.krPerM3 + nySko.krPerM3)).toBe(ore(nySk.total))

              // 2. Fördelningen tappar aldrig ett öre.
              expect(ore(nySk.andelSkordare + nySk.andelSkotare)).toBe(ore(ovrigt))

              // 3. Gamla formeln låg exakt ETT tillägg för högt på paret.
              const gammalPar = gammalKrPerM3('skordare', ms, so, t, k, te)
                              + gammalKrPerM3('skotare',  ms, so, t, k, te)
              expect(ore(gammalPar - (nySk.krPerM3 + nySko.krPerM3))).toBe(ore(ovrigt))
              fall++
            }
    expect(fall).toBe(9 * 4 * 6 * 3 * 4)
  })

  it('avståndet ingår ALDRIG i krPerM3 — bara i härledningen', () => {
    const utan = prisPerM3({ roll: 'skotare', medelstam: 0.6, acordList: ACORD, sortKr: 0, traktKr: 0, kvalitetKr: 1.5, terrangKr: 0 })
    const med  = prisPerM3({ roll: 'skotare', medelstam: 0.6, acordList: ACORD, sortKr: 0, traktKr: 0, kvalitetKr: 1.5, terrangKr: 0,
                             avstand: { kr: 16000, volym: 1000, enhetligtSteg: false } })
    expect(med.krPerM3).toBe(utan.krPerM3)
    expect(med.delar.find(d => d.etikett === 'Avstånd')?.belopp).toBe(16)
    expect(med.delar.find(d => d.etikett === 'Avstånd')?.ungefarlig).toBe(true)
  })

  it('delarna summerar till TOTALEN, inte till rollens pris', () => {
    // Härledningen beskriver objektets pris, inte skördarens del av det —
    // så visar Vida den på fakturan ("Medel 0,57=101", sedan tilläggen i
    // sin helhet). Rollens andel syns bara i à-priset.
    const p = prisPerM3({ roll: 'skordare', medelstam: 0.807, acordList: ACORD, sortKr: 2, traktKr: 2, kvalitetKr: 1.5, terrangKr: 0 })
    const summa = p.delar.reduce((s, d) => s + d.belopp, 0)
    expect(summa).toBeCloseTo(p.total, 10)
    expect(p.krPerM3).toBeLessThan(p.total)
  })
})

describe('klass bär tolkningen som saknar avtalsstöd', () => {

  it('medelstam över prislistans tak klampas till högsta klassen, och det syns', () => {
    // Åbogen: 0,807 prissatt på 0,60-raden. Avtalets tabell slutar vid 0,60 och
    // säger ingenting däröver — klampningen är en TOLKNING, inte en regel.
    // Bekräftad på faktura 2026011 (medelstam 0,86 → 56/44 = takets priser).
    const p = prisPerM3({ roll: 'skordare', medelstam: 0.807, acordList: ACORD, sortKr: 2, traktKr: 2, kvalitetKr: 1.5, terrangKr: 0 })
    expect(p.klass).toBe(0.6)
    expect(p.delar[0].etikett).toContain('0,81')
    expect(p.delar[0].etikett).toContain('0,6')
  })

  it('exakt träff på en klass visar inte någon pil', () => {
    const p = prisPerM3({ roll: 'skordare', medelstam: 0.6, acordList: ACORD, sortKr: 0, traktKr: 0, kvalitetKr: 0, terrangKr: 0 })
    expect(p.delar[0].etikett).not.toContain('→')
  })

  it('Åbogen: appens data ger totalen 103,50 — fakturans 105,50 bär en manuell post', () => {
    // Objekt 11217413, verifierat mot prod 2026-09-24:
    //   medelstam 742/919 = 0,807  → klampas till 0,60 → pris_total 100
    //   sortimentgrupper 4, grundantal 6        → 0 kr
    //   742 m³fub i traktspannet 400–800        → 2 kr
    //   kvalitetssäkring (avräkning 2026-08-10) → 1,5 kr
    //   terrang_kr_manuell = NULL               → 0 kr
    const arg = { medelstam: 0.807, acordList: ACORD, sortKr: 0, traktKr: 2, kvalitetKr: 1.5, terrangKr: 0 }
    const sk  = prisPerM3({ roll: 'skordare', ...arg })
    const sko = prisPerM3({ roll: 'skotare',  ...arg })
    expect(sk.total).toBe(103.5)
    expect(sk.krPerM3).toBe(57.5)      // 56 + 1,50 (halva 3,50 nedåt)
    expect(sko.krPerM3).toBe(46)       // 44 + 2,00 (resten)
    expect(sk.delar.map(d => d.etikett)).toEqual([
      'Grund (medelstam 0,81 → 0,6)', 'Krönt', 'Storlek',
    ])

    // Faktura 2026142 har härledningen Krönt +1,5 · Storlek +2 · Blött +2 ·
    // Avstånd +16, alltså 105,50 utan avståndet. De två kronorna "Blött"
    // finns INTE i appens data — bara två objekt i hela databasen har
    // terrang_kr_manuell satt, och Åbogen är inte ett av dem.
    //
    // Skillnaden ska bäras som en MANUELL POST med redigerbar etikett, inte
    // tryckas in i ackordspriset — annars försvinner två kronor per kubik
    // tyst på varje svår trakt. Testet låser fast gapet: den dagen någon
    // "får" 105,50 ur koden ska det vara för att posten byggts.
    const medBlott = prisPerM3({ roll: 'skordare', ...arg, terrangKr: 2 })
    expect(medBlott.total).toBe(105.5)
    expect(medBlott.total - sk.total).toBe(2)
  })

  it('tom prislista ger 0 och klass null — aldrig ett gissat pris', () => {
    const p = prisPerM3({ roll: 'skordare', medelstam: 0.5, acordList: [], sortKr: 0, traktKr: 0, kvalitetKr: 0, terrangKr: 0 })
    expect(p.krPerM3).toBe(0)
    expect(p.klass).toBeNull()
  })
})
