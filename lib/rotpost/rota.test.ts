import { describe, it, expect } from 'vitest'
import { rotaFor, type RotkapRad } from './rota'

const rad = (id: string, stammar: number, g2: number): RotkapRad =>
  ({ objekt_id: id, stammar_objekt: 1000, stammar, grupp2_stammar: g2, utan_sagstock: 5, utan_kurva: 1 })

describe('rötan efter första biten', () => {
  // Bågskyttebanan i prod: 156 stammar med rotkap och sågstock, 12 där rötan fortsatte, 9 utan sågstock.
  const rader = [{ ...rad('bsk', 156, 12), stammar_objekt: 1804, utan_sagstock: 9, utan_kurva: 0 }, rad('a', 100, 10), rad('b', 300, 10)]
  it('andel och antal', () => {
    const r = rotaFor('bsk', rader)!
    expect(r.medRotkap).toBe(165)
    expect(r.kvar).toBe(12)
    expect(r.kvarAv).toBe(156)
    expect(r.kvarAndel).toBeCloseTo(12 / 156)
  })
  it('vanligt = summa mot summa över de andra trakterna', () => {
    expect(rotaFor('bsk', rader)!.kvarVanligt).toBeCloseTo(20 / 400)
  })
  it('ingen simulering = null, inga stammar med sågstock = ingen andel', () => {
    expect(rotaFor('saknas', rader)).toBeNull()
    expect(rotaFor('x', [rad('x', 0, 0)])!.kvarAndel).toBeNull()
  })
})
