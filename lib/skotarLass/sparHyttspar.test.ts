import { describe, expect, it } from 'vitest'
import fix from './__fixtures__/wisent_lass8_2026-10-22.json'
import { sparUrHyttspar, tunnaSpar, vagTider, SPAR } from './spar'

const M = 1 / 111320
const T0 = Date.parse('2026-10-22T08:00:00Z')
const pkt = (nordM: number, sek: number, lucka = false) => ({ lat: 56.6 + nordM * M, lng: 15.8, tid: new Date(T0 + sek * 1000).toISOString(), ...(lucka ? { lucka: true } : {}) })

describe('sparUrHyttspar — lassets spår är hyttspåret mellan förra och denna lossning', () => {
  it('tar bara punkter inom [fran, till] och lägger lossningsplatsen sist', () => {
    const r = sparUrHyttspar([pkt(0, -50), pkt(10, 10), pkt(20, 20), pkt(30, 100)], T0, T0 + 30_000, { lat: 56.6 + 40 * M, lng: 15.8 })!
    expect(r.map((p) => Math.round((p.lat - 56.6) / M))).toEqual([10, 20, 40])
    expect(r[r.length - 1].ts).toBe(T0 + 30_000)
  })
  it('färre än två punkter ger null (anroparen faller tillbaka på sin buffert)', () => {
    expect(sparUrHyttspar([pkt(0, 10)], T0, T0 + 30_000)).toBeNull()
    expect(sparUrHyttspar([], T0, T0 + 30_000)).toBeNull()
  })
  it('lucka-märkningen följer med genom tunningen och spärrar steget i vägtiden', () => {
    const r = sparUrHyttspar([pkt(0, 0), pkt(10, 20), pkt(10.5, 200, true), pkt(30, 220)], T0, T0 + 300_000)!
    expect(tunnaSpar(r).some((p) => p.lucka)).toBe(true)
    const linje = [{ vag: 'v', linje: [{ lat: 56.6, lng: 15.8 }, { lat: 56.6 + 40 * M, lng: 15.8 }] }]
    // Steget 20→200 s (180 s) ligger över 90 s-taket och steget in i luckan räknas aldrig; bara 0→20 och 200→220 + 220→300 (80 s) kan räknas.
    const sek = vagTider(r, linje, SPAR.MAX_STEG_HYTTSPAR_S).reduce((s, v) => s + v.sek, 0)
    expect(sek).toBeLessThanOrEqual(20 + 20 + 80)
    expect(sek).toBeGreaterThan(0)
  })
  it('steget in i en lucka-märkt punkt räknas aldrig på en väg (även när det är kortare än 90 s)', () => {
    const linje = [{ vag: 'v', linje: [{ lat: 56.6, lng: 15.8 }, { lat: 56.6 + 100 * M, lng: 15.8 }] }]
    const utan = sparUrHyttspar([pkt(0, 0), pkt(10, 60), pkt(20, 120)], T0, T0 + 120_000)!
    const med = sparUrHyttspar([pkt(0, 0), pkt(10, 60), pkt(20, 120, true)], T0, T0 + 120_000)!
    const sek = (r: typeof utan) => vagTider(r, linje, SPAR.MAX_STEG_HYTTSPAR_S).reduce((s, v) => s + v.sek, 0)
    expect(sek(utan) - sek(med)).toBe(60)
  })
  it('en lucka-punkt närmare än 6 m tunnas inte bort', () => {
    const r = sparUrHyttspar([pkt(0, 0), pkt(3, 20), pkt(3.5, 200, true), pkt(40, 220)], T0, T0 + 300_000)!
    expect(tunnaSpar(r).filter((p) => p.lucka)).toHaveLength(1)
  })
})

describe('replay: Wisent 22 okt, lass 8 (prod)', () => {
  const punkter = fix.punkter.map(([t, lat, lng]) => ({ lat, lng, tid: new Date(t * 1000).toISOString() }))
  const fran = Date.parse(fix.fran), till = Date.parse(fix.till)

  it('spåret blir 6+ gånger så långt som det som sparades i prod (8 punkter) och täcker hela lastningen', () => {
    const r = sparUrHyttspar(punkter, fran, till, { lat: 56.228318, lng: 14.687979 })!
    const spar = tunnaSpar(r)
    expect(spar.length).toBeGreaterThanOrEqual(fix.lassSparPunkterIProd * 3)
    const lang = spar.reduce((s, p, i) => (i === 0 ? 0 : s + Math.hypot((p.lat - spar[i - 1].lat) / M, (p.lng - spar[i - 1].lng) * Math.cos(56.2 * Math.PI / 180) / M)), 0)
    expect(lang).toBeGreaterThan(300)
    // Tidsspannet: lastningen från förra lossningen (07:51) till denna (08:24) — inte 1–2 minuter.
    const sparMin = (Date.parse(spar[spar.length - 1].tid) - Date.parse(spar[0].tid)) / 60000
    expect(sparMin).toBeGreaterThan(30)
  })
})
