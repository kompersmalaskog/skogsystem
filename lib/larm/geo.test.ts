import { describe, expect, it } from 'vitest';
import { arInnePolygon, avstandPunktM, avstandTillLinjeM, narRuta, strackaNarmast } from './geo';

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

  describe('strackaNarmast: bara sträckan närmast maskinen', () => {
    // En 400 m lång linje österut genom origo; maskinen 10 m norr om x = 100.
    const lang = [p(0, 0), p(100, 0), p(200, 0), p(300, 0), p(400, 0)];
    const langd = (l: ReturnType<typeof p>[]) => l.slice(1).reduce((a, q, i) => a + avstandPunktM(l[i], q), 0);
    it('40 m åt varje håll från närmaste punkt = 80 m', () => {
      const s = strackaNarmast(p(100, 10), lang, 40);
      expect(langd(s)).toBeCloseTo(80, 0);
      expect(avstandPunktM(s[0], p(60, 0))).toBeLessThan(0.5);
      expect(avstandPunktM(s[s.length - 1], p(140, 0))).toBeLessThan(0.5);
    });
    it('hela linjen pulserar inte: sträckan är en liten del av 400 m', () => {
      expect(langd(strackaNarmast(p(250, 5), lang, 40))).toBeLessThan(lang.length * 100 / 4);
    });
    it('kortare åt ena hållet där linjen tar slut', () => {
      const s = strackaNarmast(p(10, 3), lang, 40);
      expect(avstandPunktM(s[0], p(0, 0))).toBeLessThan(0.5);
      expect(langd(s)).toBeCloseTo(50, 0);
    });
    it('en linje kortare än 80 m returneras hel', () => {
      const kort = [p(0, 0), p(30, 0), p(60, 0)];
      expect(langd(strackaNarmast(p(30, 4), kort, 40))).toBeCloseTo(60, 0);
    });
    it('följer böjar: mellanliggande punkter ligger kvar', () => {
      const bojd = [p(0, 0), p(50, 0), p(50, 50), p(100, 50)];
      const s = strackaNarmast(p(50, 20), bojd, 40);
      // Närmaste punkt ligger 70 m in på linjen: båda hörnen (50 m och 100 m in) ligger inom ±40 m och följer med.
      expect(s.some((q) => avstandPunktM(q, p(50, 0)) < 0.5)).toBe(true);
      expect(s.some((q) => avstandPunktM(q, p(50, 50)) < 0.5)).toBe(true);
      expect(s).toHaveLength(4);
    });
    it('en punkt eller tom linje kraschar inte', () => {
      expect(strackaNarmast(O, [], 40)).toEqual([]);
      expect(strackaNarmast(O, [O], 40)).toEqual([O]);
    });
  });
});
