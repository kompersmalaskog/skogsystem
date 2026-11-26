import { describe, it, expect } from 'vitest'
import { tolkaRotbitar, rotbitarProcent, ROTBITAR_MIN } from './rotbitar'

describe('rotbitar', () => {
  it('Bondeskog 11280797 i prod 2026-11-23: 84 rotbitar, 82 med timmer/kubb nästa → 98 %', () => {
    expect(rotbitarProcent(tolkaRotbitar({ rotbitar: 84, nasta_sagbar: 82 }))).toBe(98)
  })
  it('visas bara från 10 rotbitar', () => {
    expect(ROTBITAR_MIN).toBe(10)
    expect(rotbitarProcent({ rotbitar: 9, nasta_sagbar: 9 })).toBeNull()
    expect(rotbitarProcent({ rotbitar: 10, nasta_sagbar: 10 })).toBe(100)
  })
  it('hela procent, halv uppåt', () => {
    expect(rotbitarProcent({ rotbitar: 200, nasta_sagbar: 1 })).toBe(1)   // 0,5 → 1
    expect(rotbitarProcent({ rotbitar: 40, nasta_sagbar: 39 })).toBe(98)  // 97,5 → 98
  })
  it('allt som inte är två rimliga heltal är ingen rad', () => {
    for (const x of [null, undefined, 'x', 5, {}, { rotbitar: 12 }, { rotbitar: '12', nasta_sagbar: 10 },
      { rotbitar: 12.5, nasta_sagbar: 10 }, { rotbitar: 12, nasta_sagbar: 13 }, { rotbitar: -1, nasta_sagbar: 0 }]) {
      expect(tolkaRotbitar(x)).toBeNull()
    }
    expect(rotbitarProcent(null)).toBeNull()
  })
})
