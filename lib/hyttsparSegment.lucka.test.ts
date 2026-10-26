import { describe, expect, it } from 'vitest'
import { segmenteraHyttspar } from './hyttspar'

const M = 1 / 111320
const p = (nordM: number, sek: number, lucka = false) => ({ lat: 56.6 + nordM * M, lng: 15.8, tid: new Date(Date.parse('2026-10-22T08:00:00Z') + sek * 1000).toISOString(), ...(lucka ? { lucka: true } : {}) })

describe('segmenteraHyttspar — "ingen data" där fixar saknas', () => {
  it('en lucka-märkt punkt startar ett nytt segment även när den ligger nära (ingen rak linje över luckan)', () => {
    const seg = segmenteraHyttspar([p(0, 0), p(10, 20), p(12, 400, true), p(30, 420)])
    expect(seg).toHaveLength(2)
  })
  it('utan märkning dras linjen som förut', () => {
    expect(segmenteraHyttspar([p(0, 0), p(10, 20), p(12, 400), p(30, 420)])).toHaveLength(1)
  })
})
