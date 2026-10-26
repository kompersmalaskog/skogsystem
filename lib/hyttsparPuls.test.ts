import { describe, expect, it } from 'vitest'
import { arEfterLucka, arPulspunkt, LUCKA_MS, PULS_MS, tunnaOsynkade, type LuckPunkt } from './hyttsparPuls'

const M = 1 / 111320
const T0 = Date.parse('2026-10-22T08:00:00Z')
const cand = (nordM: number, sek: number, accuracy = 3) => ({ lat: 56.6 + nordM * M, lon: 15.8, ts: T0 + sek * 1000, accuracy })
const last = (nordM: number, sek: number) => ({ lat: 56.6 + nordM * M, lon: 15.8, ts: T0 + sek * 1000 })

describe('arPulspunkt — stillastående får en punkt var 60:e sekund', () => {
  it('samma plats, 60 s sedan förra: puls', () => expect(arPulspunkt(cand(0.5, 60), last(0, 0))).toBe(true))
  it('samma plats, 59 s sedan förra: ingen puls', () => expect(arPulspunkt(cand(0.5, 59), last(0, 0))).toBe(false))
  it('ingen förra punkt: ingen puls (första punkten tas av vakten)', () => expect(arPulspunkt(cand(0, 100), null)).toBe(false))
  it('dålig noggrannhet ger aldrig en puls', () => expect(arPulspunkt(cand(0.5, 120, 40), last(0, 0))).toBe(false))
  it('har rört sig 2 m eller mer: det är vaktens sak, inte en puls', () => expect(arPulspunkt(cand(3, 120), last(0, 0))).toBe(false))
  it('konstanterna: puls 60 s, lucka över 90 s', () => { expect(PULS_MS).toBe(60_000); expect(LUCKA_MS).toBe(90_000) })
})

describe('arEfterLucka', () => {
  it('91 s tystnad är en lucka, 90 s är det inte', () => {
    expect(arEfterLucka({ ts: T0 }, T0 + 91_000, true)).toBe(true)
    expect(arEfterLucka({ ts: T0 }, T0 + 90_000, true)).toBe(false)
  })
  it('stillastående med puls var 60 s blir aldrig en lucka', () => {
    expect(arEfterLucka({ ts: T0 }, T0 + PULS_MS, true)).toBe(false)
  })
  it('första punkten i sessionen: lucka bara om dagens spår redan hade punkter (återupptaget)', () => {
    expect(arEfterLucka(null, T0, true)).toBe(true)
    expect(arEfterLucka(null, T0, false)).toBe(false)
  })
})

describe('tunnaOsynkade — aldrig över en lucka', () => {
  // "Tunna" = behåll bara första och sista (värsta fall: allt däremellan är rakt).
  const forstaSista = (pts: LuckPunkt[]) => (pts.length <= 2 ? pts : [pts[0], pts[pts.length - 1]])
  const p = (n: number, lucka = false): LuckPunkt => ({ lat: 56.6 + n * M, lng: 15.8, tid: `t${n}`, ...(lucka ? { lucka: true } : {}) })

  it('utan luckor: som en vanlig tunning, ankaret returneras inte', () => {
    const ut = tunnaOsynkade(p(0), [p(1), p(2), p(3)], forstaSista)
    expect(ut.map((x) => x.tid)).toEqual(['t3'])
  })
  it('en lucka bryter tunningen: punkten efter luckan finns kvar och hamnar först i sin bit', () => {
    const ut = tunnaOsynkade(p(0), [p(1), p(2), p(3, true), p(4), p(5)], forstaSista)
    expect(ut.map((x) => x.tid)).toEqual(['t2', 't3', 't5'])
    expect(ut.find((x) => x.tid === 't3')!.lucka).toBe(true)
  })
  it('lucka direkt efter ankaret: ankaret hänger inte ihop med nästa bit', () => {
    const ut = tunnaOsynkade(p(0), [p(1, true), p(2), p(3)], forstaSista)
    expect(ut.map((x) => x.tid)).toEqual(['t1', 't3'])
  })
  it('utan ankare behålls första punkten', () => {
    const ut = tunnaOsynkade(null, [p(1), p(2), p(3)], forstaSista)
    expect(ut.map((x) => x.tid)).toEqual(['t1', 't3'])
  })
})
