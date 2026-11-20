import { describe, it, expect } from 'vitest'
import { kostnadsstalleFor, harKrockandeKostnadsstalle, type KostnadsstalleRad } from './kostnadsstalle'

/** Registret som migration 20260926 lämnar det. */
const REGISTER: KostnadsstalleRad[] = [
  { maskin_id: 'R64101', kostnadsstalle_kod: 'M12', giltig_fran: '2023-02-24', giltig_till: '2026-03-11' },
  { maskin_id: 'R64428', kostnadsstalle_kod: 'M12', giltig_fran: '2026-03-12', giltig_till: null },
  { maskin_id: 'PONS20SDJAA270231', kostnadsstalle_kod: 'M13', giltig_fran: '2025-07-31', giltig_till: '2026-03-08' },
  { maskin_id: 'PONS20SDJAA270231', kostnadsstalle_kod: 'SCO', giltig_fran: '2026-03-09', giltig_till: null },
  { maskin_id: 'A030353', kostnadsstalle_kod: 'M14', giltig_fran: '2024-06-05', giltig_till: null },
  { maskin_id: 'A130743', kostnadsstalle_kod: 'EP', giltig_fran: '2026-08-13', giltig_till: null },
  { maskin_id: 'JD810E', kostnadsstalle_kod: 'M6', giltig_fran: '2026-01-09', giltig_till: null },
]

describe('Scorpionens byte M13 → SCO', () => {

  it('en januarifaktura får M13, inte dagens SCO', () => {
    // Detta är hela poängen med migrationen. 36 fakturarader bokfördes på
    // M13; ett underlag som byggs om för den perioden måste ge samma kod,
    // annars stämmer fakturan inte med bokföringen.
    expect(kostnadsstalleFor('PONS20SDJAA270231', '2026-01-09', REGISTER)).toBe('M13')
    expect(kostnadsstalleFor('PONS20SDJAA270231', '2026-02-17', REGISTER)).toBe('M13')
  })

  it('gränsen går mellan 2026-03-08 och 2026-03-09', () => {
    expect(kostnadsstalleFor('PONS20SDJAA270231', '2026-03-08', REGISTER)).toBe('M13')
    expect(kostnadsstalleFor('PONS20SDJAA270231', '2026-03-09', REGISTER)).toBe('SCO')
  })

  it('dagens datum ger SCO', () => {
    expect(kostnadsstalleFor('PONS20SDJAA270231', '2026-09-26', REGISTER)).toBe('SCO')
  })

  it('före maskinens första dag finns inget kostnadsställe — och det är ett svar', () => {
    expect(kostnadsstalleFor('PONS20SDJAA270231', '2025-07-30', REGISTER)).toBeNull()
  })
})

describe('de två Rottne som delade M12', () => {

  it('samma kod, olika maskiner, noll dagars överlapp', () => {
    expect(kostnadsstalleFor('R64101', '2026-03-11', REGISTER)).toBe('M12')
    expect(kostnadsstalleFor('R64101', '2026-03-12', REGISTER)).toBeNull()
    expect(kostnadsstalleFor('R64428', '2026-03-11', REGISTER)).toBeNull()
    expect(kostnadsstalleFor('R64428', '2026-03-12', REGISTER)).toBe('M12')
  })

  it('R64101 når tillbaka till källornas ytterkant 2023-02-24', () => {
    expect(kostnadsstalleFor('R64101', '2023-02-24', REGISTER)).toBe('M12')
    expect(kostnadsstalleFor('R64101', '2023-02-23', REGISTER)).toBeNull()
  })
})

describe('null är ett svar, aldrig en gissning', () => {

  it('okänd maskin ger null', () => {
    expect(kostnadsstalleFor('FINNS_EJ', '2026-09-26', REGISTER)).toBeNull()
  })

  it('tomt register ger null — inte ett kraschande uppslag', () => {
    expect(kostnadsstalleFor('A030353', '2026-09-26', [])).toBeNull()
    expect(kostnadsstalleFor('A030353', '2026-09-26', null)).toBeNull()
  })

  it('TVÅ giltiga rader ger null och flaggas — aldrig "ta den första"', () => {
    // Migrationen avbryter på överlapp, så det ska inte kunna hända. Skulle
    // det ändå göra det får uppslaget inte dölja felet genom att välja en av
    // dem. Samma lärdom som ovrigtKrPerM3:s fallback före #575.
    const krock = [
      ...REGISTER,
      { maskin_id: 'A030353', kostnadsstalle_kod: 'M99', giltig_fran: '2024-06-05', giltig_till: null },
    ]
    expect(kostnadsstalleFor('A030353', '2026-09-26', krock)).toBeNull()
    expect(harKrockandeKostnadsstalle('A030353', '2026-09-26', krock)).toBe(true)
    expect(harKrockandeKostnadsstalle('A030353', '2026-09-26', REGISTER)).toBe(false)
  })

  it('JD810E får M6 från fakturadatumet, inte från sin första lassrad', () => {
    // Maskinen saknar fakt_tid och syns först 2026-09-08 i fakt_lass, men
    // M6 bokfördes redan 2026-01-09. Faktadatumet hade lämnat åtta månader
    // utan kostnadsställe för en maskin som fakturerades hela tiden.
    expect(kostnadsstalleFor('JD810E', '2026-01-09', REGISTER)).toBe('M6')
    expect(kostnadsstalleFor('JD810E', '2026-09-08', REGISTER)).toBe('M6')
  })
})
