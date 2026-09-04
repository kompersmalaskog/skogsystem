import { describe, it, expect } from 'vitest'
import { skotningsavstandM } from './skotningsavstand'
import { skotAvstandKr, type AvstandConfig } from './ekonomi/acord'

// Den aktiva formelraden i acord_skotningsavstand: grundavstånd 200 m,
// 4 kr per påbörjade 100 m däröver.
const CONFIG: AvstandConfig[] = [
  { grundavstand_m: 200, kr_per_100m: 4, giltig_fran: '2026-04-21', giltig_till: null },
]
const D = '2026-08-15'

describe('skotningsavstandM', () => {

  it('halverar korstracka_m — maskinen mäter tur och retur', () => {
    expect(skotningsavstandM(1000)).toBe(500)
    expect(skotningsavstandM(901)).toBe(450.5)
  })

  it('saknat värde blir 0, aldrig NaN', () => {
    expect(skotningsavstandM(null)).toBe(0)
    expect(skotningsavstandM(undefined)).toBe(0)
    expect(skotningsavstandM(0)).toBe(0)
  })

  it('reproducerar de handifyllda objekten: Brokamåla 901 → 450, Tjuvön 431 → 215', () => {
    // dim_objekt.skotavstand_manuell är 450 resp. 200 — satta för hand mot
    // samma trakter. Håller den här överens är enheten rätt.
    expect(Math.round(skotningsavstandM(901))).toBe(451)
    expect(Math.round(skotningsavstandM(431))).toBe(216)
  })
})

describe('skotAvstandKr tar EMOT skotningsavstånd, inte korstracka_m', () => {

  it('lass på 1 000 m korstracka ger 16 kr/m³ — inte 32', () => {
    // 1 000 m tur och retur = 500 m skotningsavstånd
    // → ceil((500−200)/100) = 3 steg × 4 kr = 12 kr/m³
    const ratt = skotAvstandKr(D, skotningsavstandM(1000), 1, CONFIG)
    expect(ratt).toBe(12)
    // Råvärdet in hade gett ceil((1000−200)/100) = 8 steg = 32 kr/m³.
    // Det är felet den här modulen finns för att förhindra.
    expect(skotAvstandKr(D, 1000, 1, CONFIG)).toBe(32)
  })

  it('under grundavståndet ger noll — inte ett litet tillägg', () => {
    // 380 m korstracka = 190 m skotningsavstånd, under 200 m.
    expect(skotAvstandKr(D, skotningsavstandM(380), 10, CONFIG)).toBe(0)
    // Ohalverat hade samma lass gett 8 kr/m³.
    expect(skotAvstandKr(D, 380, 10, CONFIG)).toBe(80)
  })

  it('exakt på grundavståndet ger noll steg', () => {
    expect(skotAvstandKr(D, 200, 1, CONFIG)).toBe(0)
    expect(skotAvstandKr(D, 201, 1, CONFIG)).toBe(4)
  })

  it('tillägget skalar med lassvolymen', () => {
    expect(skotAvstandKr(D, skotningsavstandM(1000), 10, CONFIG)).toBe(120)
  })

  it('utan datumgiltig config: 0 kr, aldrig ett gissat pris', () => {
    expect(skotAvstandKr('2026-01-01', 500, 10, CONFIG)).toBe(0)
  })
})
