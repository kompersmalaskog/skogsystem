import { describe, expect, it } from 'vitest';
import { arInnePolygon, avstandPunktM, avstandTillLinjeM, klippLinjeNara, narRuta } from './geo';

const O = { lat: 56.5, lon: 14.7 };
const M_LAT = 1 / 111320;
const M_LON = 1 / (111320 * Math.cos(56.5 * Math.PI / 180));
const p = (ost: number, nord: number) => ({ lat: O.lat + nord * M_LAT, lon: O.lon + ost * M_LON });

describe('geo', () => {
  it('avstånd mellan punkter i meter', () => {
    expect(avstandPunktM(O, p(30, 40))).toBeCloseTo(50, 0);
  });
  it('avstånd till linje: vinkelrätt mot segmentet, inte mot hörnen', () => {
    const linje = [p(-100, 20), p(100, 20)];
    expect(avstandTillLinjeM(O, linje)).toBeCloseTo(20, 1);
  });
  it('avstånd till linje bortom änden mäts mot ändpunkten', () => {
    expect(avstandTillLinjeM(O, [p(30, 0), p(100, 0)])).toBeCloseTo(30, 1);
  });
  it('en linje med en punkt är en punkt, en tom linje är oändligt långt bort', () => {
    expect(avstandTillLinjeM(O, [p(0, 25)])).toBeCloseTo(25, 1);
    expect(avstandTillLinjeM(O, [])).toBe(Infinity);
  });
  it('inne i en fyrkant, utanför, och i ett hål', () => {
    const ytter = [p(-50, -50), p(50, -50), p(50, 50), p(-50, 50)];
    const hal = [p(-10, -10), p(10, -10), p(10, 10), p(-10, 10)];
    expect(arInnePolygon(O, [ytter])).toBe(true);
    expect(arInnePolygon(p(80, 0), [ytter])).toBe(false);
    expect(arInnePolygon(O, [ytter, hal])).toBe(false);
    expect(arInnePolygon(p(30, 0), [ytter, hal])).toBe(true);
  });
  it('färre än tre punkter är ingen yta', () => {
    expect(arInnePolygon(O, [[p(0, 0), p(1, 1)]])).toBe(false);
  });
  it('ruta-förkollen släpper igenom det som är inom marginalen och stoppar resten', () => {
    const f = [p(100, 100), p(200, 100), p(200, 200)];
    expect(narRuta(O, f, 60)).toBe(false);
    expect(narRuta(p(70, 70), f, 60)).toBe(true);
  });
});

describe('klippLinjeNara — bara sträckan närmast maskinen', () => {
  const lang = [p(-200, 20), p(0, 20), p(200, 20)];            // 400 m linje 20 m norr om origo
  it('ger ~40 m åt varje håll (80 m totalt) runt närmaste punkt', () => {
    const k = klippLinjeNara(O, lang, 40);
    let l = 0; for (let i = 0; i < k.length - 1; i++) l += avstandPunktM(k[i], k[i + 1]);
    expect(l).toBeCloseTo(80, 0);
    expect(avstandPunktM(k[0], p(-40, 20))).toBeLessThan(1);
    expect(avstandPunktM(k[k.length - 1], p(40, 20))).toBeLessThan(1);
  });
  it('följer maskinen: står man längre fram klipps en annan sträcka', () => {
    const k = klippLinjeNara(p(100, 0), lang, 40);
    expect(avstandPunktM(k[0], p(60, 20))).toBeLessThan(1);
    expect(avstandPunktM(k[k.length - 1], p(140, 20))).toBeLessThan(1);
  });
  it('vid linjens ände klipps den mot änden (inget utanför linjen)', () => {
    const k = klippLinjeNara(p(-195, 0), lang, 40);
    expect(avstandPunktM(k[0], lang[0])).toBeLessThan(1);
    let l = 0; for (let i = 0; i < k.length - 1; i++) l += avstandPunktM(k[i], k[i + 1]);
    expect(l).toBeLessThan(46);
  });
  it('en kort linje (< 80 m) pulserar helt; en punkt eller tom linje lämnas orörd', () => {
    const kort = [p(-20, 5), p(20, 5)];
    expect(klippLinjeNara(O, kort, 40)).toEqual(kort);
    expect(klippLinjeNara(O, [p(1, 1)], 40)).toEqual([p(1, 1)]);
    expect(klippLinjeNara(O, [], 40)).toEqual([]);
  });
  it('behåller hörnpunkter inom sträckan', () => {
    const vinkel = [p(-100, 0), p(0, 0), p(0, 100)];
    const k = klippLinjeNara(p(0, 0), vinkel, 40);
    expect(k.some((q) => avstandPunktM(q, p(0, 0)) < 0.5)).toBe(true);
  });
});
