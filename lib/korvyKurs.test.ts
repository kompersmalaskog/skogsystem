import { describe, expect, it } from 'vitest'
import { FOLJ, KART_DODBAND_GRAD, TOM_KURS, foljTid, kartRiktning, stegaKurs, vinkelSkillnad, type KursLage } from './korvyKurs'

// 1 m norrut ≈ 0,000009° lat; 1 m österut vid lat 56 ≈ 0,0000161° lon.
const P = (nordM: number, ostM: number) => ({ lat: 56.5 + nordM * 0.000008993, lon: 15 + ostM * 0.00001629 })
const kor = (start: KursLage, punkter: { lat: number; lon: number }[]) => punkter.reduce(stegaKurs, start)

describe('stegaKurs', () => {
  it('kör norrut → kursen är norr', () => {
    const l = kor(TOM_KURS, [P(0, 0), P(5, 0), P(10, 0), P(15, 0)])
    expect(Math.abs(vinkelSkillnad(l.kurs!, 0))).toBeLessThan(1)
  })
  it('STÅR STILL: brus på ett par meter ändrar ingenting (samma objekt tillbaka)', () => {
    const l = kor(TOM_KURS, [P(0, 0), P(10, 0), P(20, 0)])
    let n = l
    for (const [a, b] of [[1.5, -2], [-2, 1], [2.5, 2], [-1, -2.5], [0.5, 3]]) n = stegaKurs(n, P(20 + a, b))
    expect(n).toBe(l)
  })
  it('en sväng jämnas ut men kommer fram', () => {
    let l = kor(TOM_KURS, [P(0, 0), P(10, 0)])
    l = stegaKurs(l, P(10, 10))   // tvärt österut
    expect(l.kurs!).toBeGreaterThan(40); expect(l.kurs!).toBeLessThan(70)   // inte hela vägen på ett steg
    l = kor(l, [P(10, 20), P(10, 30), P(10, 40)])
    expect(Math.abs(vinkelSkillnad(l.kurs!, 90))).toBeLessThan(8)
  })
  it('BACKAR en kort bit: riktningen står kvar', () => {
    let l = kor(TOM_KURS, [P(0, 0), P(10, 0), P(20, 0)])
    const fore = l.kurs!
    l = kor(l, [P(15, 0), P(10, 0)])   // 10 m bakåt
    expect(l.kurs).toBe(fore)
    l = kor(l, [P(15, 0), P(20, 0)])   // framåt igen: räknaren nollas
    expect(l.bak).toBe(0)
    expect(Math.abs(vinkelSkillnad(l.kurs!, 0))).toBeLessThan(1)
  })
  it('kör längre åt andra hållet: då är det den nya körriktningen', () => {
    let l = kor(TOM_KURS, [P(0, 0), P(10, 0), P(20, 0)])
    l = kor(l, [P(15, 0), P(10, 0), P(5, 0), P(0, 0)])
    expect(Math.abs(vinkelSkillnad(l.kurs!, 180))).toBeLessThan(1)
  })
  it('ett GPS-hopp ger ingen kurs', () => {
    const l = kor(TOM_KURS, [P(0, 0), P(10, 0), P(20, 0)])
    const n = stegaKurs(l, P(20, 300))
    expect(n.kurs).toBe(l.kurs)
    expect(Math.abs(vinkelSkillnad(kor(n, [P(25, 300), P(30, 300)]).kurs!, 0))).toBeLessThan(1)
  })
  it('en trasig position ändrar ingenting', () => {
    const l = kor(TOM_KURS, [P(0, 0), P(10, 0)])
    expect(stegaKurs(l, { lat: NaN, lon: 15 })).toBe(l)
  })
})

describe('kartRiktning', () => {
  it('småändringar vrider inte kartan', () => {
    expect(kartRiktning(90, 90 + KART_DODBAND_GRAD - 1)).toBe(90)
    expect(kartRiktning(358, 2)).toBe(358)
  })
  it('en riktig sväng gör det', () => {
    expect(kartRiktning(90, 110)).toBe(110)
    expect(kartRiktning(null, 45)).toBe(45)
  })
})

describe('foljTid', () => {
  it('glider lika länge som mellan punkterna (lite till, så att det inte blir ett stopp)', () => {
    expect(foljTid(1000)).toBe(1100)
    expect(foljTid(100)).toBe(FOLJ.MIN_MS)
    expect(foljTid(3000)).toBe(FOLJ.MAX_MS)
  })
  it('okänt eller orimligt mellanrum → en sekund', () => {
    expect(foljTid(null)).toBe(FOLJ.STANDARD_MS)
    expect(foljTid(60000)).toBe(FOLJ.STANDARD_MS)
  })
})
