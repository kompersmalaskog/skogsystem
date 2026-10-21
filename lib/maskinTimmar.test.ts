import { describe, expect, it } from 'vitest'
import { avlastText, nastaService, senastServiceTimmar, senasteAvlasning, serviceLage, serviceText, timmarText, uppskatta } from './maskinTimmar'

const a = (datum: string, timmar: number) => ({ datum, timmar, kalla: 'avlasning' as const })

describe('avläsning och uppskattning', () => {
  it('senaste datum vinner; samma dag den högsta', () => {
    expect(senasteAvlasning([a('2026-08-04', 5568), a('2026-10-02', 4512)])?.timmar).toBe(4512)
    expect(senasteAvlasning([a('2026-10-02', 4512), a('2026-10-02', 4520)])?.timmar).toBe(4520)
    expect(senasteAvlasning([])).toBeNull()
  })
  it('motortiden räknas bara dagarna EFTER avläsningen', () => {
    const u = uppskatta([a('2026-10-02', 4512)], [{ datum: '2026-10-02', sek: 36000 }, { datum: '2026-10-05', sek: 36000 }, { datum: '2026-10-15', sek: 7200 }])!
    expect(u.timmar).toBe(4524)
    expect(timmarText(u)).toBe('ca 4 524 h')
    expect(avlastText(u, d => (d === '2026-10-02' ? '2 okt' : d))).toBe('Avläst 2 okt: 4 512 h · sedan dess +12 h från maskinen')
  })
  it('utan något tillagt: exakt, utan "ca"', () => {
    const u = uppskatta([a('2026-10-21', 4600)], [])!
    expect(timmarText(u)).toBe('4 600 h')
    expect(avlastText(u, () => 'idag')).toBe('Avläst idag: 4 600 h')
  })
  it('ingen avläsning = inga timmar (aldrig bara filernas summa)', () => {
    expect(uppskatta([], [{ datum: '2026-10-05', sek: 36000 }])).toBeNull()
  })
})

describe('nästa service i fasta steg', () => {
  it('utan registrerad service: nästa steg över dagens timmar', () => {
    expect(nastaService(900, 4524, null)).toEqual({ nastaVid: 5400, kvarH: 876, foregaendeVid: 4500 })
  })
  it('service strax före steget räknas som det steget (4 480 → 4 500-servicen, nästa 5 400)', () => {
    expect(nastaService(900, 4600, 4480).nastaVid).toBe(5400)
  })
  it('missad service syns som över', () => {
    const s = nastaService(900, 1812, 900)
    expect(s.nastaVid).toBe(1800)
    expect(serviceText(s)).toBe('Dags för service · 12 h över')
    expect(serviceLage(s)).toBe('over')
  })
  it('nära under 50 h, exakt på steget = dags', () => {
    expect(serviceLage(nastaService(900, 1760, 900))).toBe('nara')
    expect(serviceText(nastaService(900, 1800, 900))).toBe('Dags för service')
    expect(serviceLage(nastaService(500, 300, null))).toBe('ok')
  })
  it('bara serviceposter med timmätare räknas som service', () => {
    expect(senastServiceTimmar([
      { kategori: 'ovrigt', timmar: 5568, datum: '2026-08-04' },
      { kategori: 'service', timmar: 250, datum: '2026-03-30' },
      { kategori: 'service', timmar: null, datum: '2026-09-01' },
    ])).toBe(250)
  })
})
