import { describe, expect, it } from 'vitest';
import { arInnePolygon, avstandPunktM, avstandTillLinjeM, narRuta } from './geo';

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
