import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  valjJamforelseMaskiner, kvot, skillnadPct, getKlassIdx, KLASSER,
  summeraPerMaskinObjekt, objektSkotningsavstand, volymPerObjekt,
  type DimMaskinRad,
} from './jamforelse'

// dim_maskin ur produktion 2026-10-21 (skotare).
const DIM: DimMaskinRad[] = [
  { maskin_id: 'JD810E',  visningsnamn: '810E',       modell: '810E',             maskin_typ: 'Forwarder', aktiv_fran: '2015-12-01', aktiv_till: null,         bekraftad: true },
  { maskin_id: 'A110148', visningsnamn: 'Elefant AF', modell: 'Elephant King AF', maskin_typ: 'Forwarder', aktiv_fran: '2021-03-01', aktiv_till: '2026-07-08', bekraftad: true },
  { maskin_id: 'A030353', visningsnamn: 'Wisent',     modell: 'Wisent2015',       maskin_typ: 'Forwarder', aktiv_fran: '2024-07-01', aktiv_till: null,         bekraftad: true },
  { maskin_id: 'A130743', visningsnamn: 'Elefant 26', modell: 'Elephant King 2026', maskin_typ: 'Forwarder', aktiv_fran: '2026-08-13', aktiv_till: null,       bekraftad: true },
  { maskin_id: 'R64428',  visningsnamn: 'Rottne H8E -26', modell: 'H8E',          maskin_typ: 'Harvester', aktiv_fran: '2026-03-12', aktiv_till: null,         bekraftad: true },
]

describe('valjJamforelseMaskiner — maskinval ur dim_maskin', () => {
  it('oktober 2026: nya Elephant King, inte den gamla (felet: "0 lass · 0 m³")', () => {
    expect(valjJamforelseMaskiner(DIM, '2026-10-01', '2026-10-31')).toEqual({ wisent: ['A030353'], ek: ['A130743'] })
  })
  it('juni 2026: gamla Elephant King', () => {
    expect(valjJamforelseMaskiner(DIM, '2026-06-01', '2026-06-30')).toEqual({ wisent: ['A030353'], ek: ['A110148'] })
  })
  it('period över bytet (år): båda Elephant King, äldst först', () => {
    expect(valjJamforelseMaskiner(DIM, '2026-01-01', '2026-12-31').ek).toEqual(['A110148', 'A130743'])
  })
  it('lucka mellan maskinerna (20 juli): ingen EK — vyn skriver orsak, gissar inte', () => {
    expect(valjJamforelseMaskiner(DIM, '2026-07-20', '2026-07-31').ek).toEqual([])
  })
  it('810E, skördare och obekräftade maskiner ingår aldrig', () => {
    const r = valjJamforelseMaskiner([...DIM, { ...DIM[3], maskin_id: 'X', bekraftad: false }], '2026-01-01', '2026-12-31')
    expect([...r.wisent, ...r.ek]).not.toContain('JD810E')
    expect([...r.wisent, ...r.ek]).not.toContain('R64428')
    expect([...r.wisent, ...r.ek]).not.toContain('X')
  })
})

describe('skyddade kvoter', () => {
  it('kvot: nämnare saknas / 0 / negativ → null, aldrig division ändå', () => {
    expect(kvot(10, 0)).toBeNull()
    expect(kvot(10, null)).toBeNull()
    expect(kvot(10, -1)).toBeNull()
    expect(kvot(null, 5)).toBeNull()
    expect(kvot(NaN, 5)).toBeNull()
    expect(kvot(0, 5)).toBe(0)
    expect(kvot(3028, 105)).toBeCloseTo(28.84, 2)
  })
  it('skillnadPct: facit EK 28,8 mot Wisent 13,8 är ca +109 %, inte +36 553 %', () => {
    expect(skillnadPct(28.8, 13.8)).toBeCloseTo(108.7, 1)
    expect(skillnadPct(13.8, 28.8)).toBeCloseTo(-52.1, 1)
    expect(skillnadPct(5, 0)).toBeNull()
    expect(skillnadPct(null, 5)).toBeNull()
  })
})

describe('klasser', () => {
  it('gränserna följer ackordstrappan', () => {
    expect(KLASSER).toHaveLength(5)
    expect(getKlassIdx(199)).toBe(0)
    expect(getKlassIdx(200)).toBe(1)
    expect(getKlassIdx(599)).toBe(3)
    expect(getKlassIdx(5000)).toBe(4)
  })
})

describe('summeraPerMaskinObjekt', () => {
  const tid = (extra: object = {}) => ({
    maskin_id: 'A130743', objekt_id: 'O1', datum: '2026-10-05',
    processing_sek: 3600, terrain_sek: 1800, other_work_sek: 900, bransle_liter: '12.5', ...extra,
  })

  it('G15 = processing + terrain + other_work (lib/g15), inte bara P+T', () => {
    const [s] = summeraPerMaskinObjekt([], [tid()])
    expect(s.g15h).toBeCloseTo(1.75, 6)          // 6300 s, inte 5400
    expect(s.bransle).toBeCloseTo(12.5, 6)
  })

  it('volym kommer från maskinens EGNA lass, aldrig från något annat objektbundet', () => {
    const lass = [
      { maskin_id: 'A130743', objekt_id: 'O1', volym_m3sub: 20, korstracka_m: 700 },
      { maskin_id: 'A130743', objekt_id: 'O1', volym_m3sub: 22, korstracka_m: 760 },
      { maskin_id: 'A030353', objekt_id: 'O1', volym_m3sub: 15, korstracka_m: 600 },
    ]
    const r = summeraPerMaskinObjekt(lass, [tid(), tid({ maskin_id: 'A030353' })])
    const ek = r.find(x => x.maskin_id === 'A130743')!
    const wi = r.find(x => x.maskin_id === 'A030353')!
    expect(ek.volym).toBe(42)
    expect(ek.lass).toBe(2)
    expect(wi.volym).toBe(15)
    expect(objektSkotningsavstand(ek)).toBe(365)   // (700+760)/2 tur-retur → 730 → enkel väg 365
  })

  it('lass utan körsträcka räknas i volym men ger ingen klass (null, inte klass 0)', () => {
    const [s] = summeraPerMaskinObjekt([{ maskin_id: 'A', objekt_id: 'O', volym_m3sub: 10, korstracka_m: null }], [])
    expect(s.volym).toBe(10)
    expect(objektSkotningsavstand(s)).toBeNull()
  })

  it('EK oktober i facitets storlek: 3 028 m³ / 105,0 G15h = 28,8 — SUM/SUM över objekten', () => {
    // Två objekt med olika förhållande; snitt av snitt hade gett ett annat tal.
    const lass = [
      ...Array.from({ length: 100 }, () => ({ maskin_id: 'A130743', objekt_id: 'A', volym_m3sub: 22, korstracka_m: 700 })),
      ...Array.from({ length: 36 },  () => ({ maskin_id: 'A130743', objekt_id: 'B', volym_m3sub: 23, korstracka_m: 800 })),
    ]
    const g = (h: number) => ({ processing_sek: h * 3600, terrain_sek: 0, other_work_sek: 0 })
    const rad = summeraPerMaskinObjekt(lass, [
      tid({ objekt_id: 'A', ...g(70) }), tid({ objekt_id: 'B', ...g(35) }),
    ])
    const vol = rad.reduce((a, r) => a + r.volym, 0)
    const g15 = rad.reduce((a, r) => a + r.g15h, 0)
    expect(vol).toBe(3028)
    expect(g15).toBeCloseTo(105, 6)
    expect(kvot(vol, g15)).toBeCloseTo(28.8, 1)
    // snitt av snitt (31,4 och 23,7 → 27,5) skiljer sig — därför SUM/SUM
    expect((2200 / 70 + 828 / 35) / 2).not.toBeCloseTo(28.8, 0)
  })
})

describe('volymPerObjekt — delade skotarvolym', () => {
  it('objekt utan manuell volym: rå lass-volym i perioden', () => {
    const lass = [
      { datum: '2026-10-02', maskin_id: 'A130743', volym_m3sub: 21, objekt_id: 'O1' },
      { datum: '2026-10-03', maskin_id: 'A130743', volym_m3sub: 22, objekt_id: 'O1' },
      { datum: '2026-09-30', maskin_id: 'A130743', volym_m3sub: 99, objekt_id: 'O1' }, // utanför perioden
    ]
    const { perObjekt, harManuell } = volymPerObjekt(lass, [], [], 'A130743', '2026-10-01', '2026-10-31')
    expect(perObjekt.get('O1')).toBe(43)
    expect(harManuell).toBe(false)
  })

  it('manuell korrigering: objektets manuella totalvolym ersätter rålass-summan', () => {
    const lass = [
      { datum: '2026-10-02', maskin_id: 'A030353', volym_m3sub: 200, objekt_id: 'K' },
      { datum: '2026-10-03', maskin_id: 'A030353', volym_m3sub: 200, objekt_id: 'K' },
    ]
    const tid = [
      { datum: '2026-10-02', maskin_id: 'A030353', processing_sek: 3600, terrain_sek: 0, other_work_sek: 0, objekt_id: 'K' },
      { datum: '2026-10-03', maskin_id: 'A030353', processing_sek: 3600, terrain_sek: 0, other_work_sek: 0, objekt_id: 'K' },
    ]
    const manuell = [{ objekt_id: 'K', maskin_id: 'A030353', volym_m3: 315 }]
    const { perObjekt, harManuell } = volymPerObjekt(lass, manuell, tid, 'A030353', '2026-10-01', '2026-10-31')
    expect(harManuell).toBe(true)
    expect(perObjekt.get('K')).toBeCloseTo(315, 6)
  })
})

describe('källvakt — inga hårdkodade maskin-id i Jämförelse-vyerna', () => {
  for (const fil of ['app/maskinvy/Jamforelse.tsx', 'app/maskinvy/SkotareJamforelseNy.tsx']) {
    it(fil, () => {
      const kalla = readFileSync(join(process.cwd(), fil), 'utf-8')
      // kommentarer får nämna dem; kod får inte
      const utanKommentarer = kalla.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(utanKommentarer).not.toMatch(/A110148|A130743|A030353/)
      // ingen egen G15-formel: summan ska gå via g15Sek
      expect(utanKommentarer).not.toMatch(/processing_sek\s*\|\|\s*0\)\s*\+\s*\(r\.terrain_sek/)
      // aldrig skördarens produktion som skotarvolym
      expect(utanKommentarer).not.toMatch(/from\('fakt_produktion'\)/)
    })
  }
})
