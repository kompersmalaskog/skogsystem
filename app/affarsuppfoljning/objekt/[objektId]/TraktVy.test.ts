import { describe, it, expect } from 'vitest'
import { timmerMening } from './TraktVy'
import type { Trakt } from '@/lib/rotpost/uppfoljning'

const t = (timmer: number, vanligt: number | null): Trakt => ({
  id: 'x', namn: 'X', typ: 'Slutavverkning', forsta: '2026-09-01', volym: 1000, stammar: 1000, medelstam: 0.62, rotpost: false,
  andel: { timmer, kubb: 10, massa: 90 - timmer - 2, ovrigt: 2 }, m3: { timmer, kubb: 10, massa: 0, ovrigt: 0 },
  vanligt: vanligt == null ? null : { timmer: vanligt, kubb: 10, massa: 88 - vanligt, ovrigt: 2 }, jamfordaTrakter: 5, rota: null,
  skordning: { lage: 'okand' },
})

describe('timrets mening', () => {
  it('som vanligt inom ±2', () => expect(timmerMening(t(57, 55))).toMatch(/^Lika mycket/))
  it('mer', () => expect(timmerMening(t(66, 55))).toMatch(/^11 procentenheter mer/))
  it('mindre', () => expect(timmerMening(t(50, 55))).toMatch(/^5 procentenheter mindre/))
  it('inget att jämföra med', () => expect(timmerMening(t(70, null))).toBe('För få trakter med medelstam 0,62 att jämföra med.'))
})
