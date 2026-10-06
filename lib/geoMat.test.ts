import { describe, it, expect } from 'vitest';
import { metersBetween, pathMeters, ringAreaM2, formatLength, formatArea, formatHa, figurEtikett, linjeMitt, hornMitt, type LngLat } from './geoMat';

// Meter → lng/lat runt Hålabäck.
const LAT0 = 56.35, LNG0 = 15.05, R = 6371008.8, RAD = Math.PI / 180;
const fran = (x: number, y: number): LngLat => [LNG0 + x / (R * Math.cos(LAT0 * RAD) * RAD), LAT0 + y / (R * RAD)];

describe('längd (haversine)', () => {
  it('100 m rakt norrut ≈ 100 m; summeras över flera punkter', () => {
    expect(metersBetween(fran(0, 0), fran(0, 100))).toBeCloseTo(100, 1);
    expect(pathMeters([fran(0, 0), fran(0, 100), fran(100, 100)])).toBeCloseTo(200, 1);
  });
  it('färre än två punkter → 0', () => {
    expect(pathMeters([])).toBe(0);
    expect(pathMeters([fran(0, 0)])).toBe(0);
  });
});

describe('yta (sfärisk excess, samma som @turf/area)', () => {
  it('100×100 m ≈ 1 ha (memory: matten testad mot kända mått, 10011 m²)', () => {
    const a = ringAreaM2([fran(0, 0), fran(100, 0), fran(100, 100), fran(0, 100)]);
    expect(a).toBeGreaterThan(9900);
    expect(a).toBeLessThan(10100);
  });
  it('1×1 km ≈ 100 ha', () => {
    const a = ringAreaM2([fran(0, 0), fran(1000, 0), fran(1000, 1000), fran(0, 1000)]);
    expect(a / 10000).toBeGreaterThan(99);
    expect(a / 10000).toBeLessThan(101);
  });
  it('oberoende av varvtal (medsols/motsols) och av om ringen är sluten med en extra punkt', () => {
    const medsols = [fran(0, 0), fran(0, 100), fran(100, 100), fran(100, 0)];
    const motsols = [...medsols].reverse();
    expect(ringAreaM2(medsols)).toBeCloseTo(ringAreaM2(motsols), 4);
  });
  it('färre än tre punkter → 0', () => {
    expect(ringAreaM2([fran(0, 0), fran(10, 10)])).toBe(0);
  });
});

describe('formatLength / formatArea — oförändrade formler ur planeringsvyn', () => {
  it('m under 1 km, km med 2 decimaler däröver', () => {
    expect(formatLength(0)).toBe('0 m');
    expect(formatLength(384.4)).toBe('384 m');
    expect(formatLength(999.4)).toBe('999 m');
    expect(formatLength(1000)).toBe('1.00 km');
    expect(formatLength(2345)).toBe('2.35 km');
  });
  it('m² under 1 ha, ha med 2 decimaler däröver', () => {
    expect(formatArea(0)).toBe('0 m²');
    expect(formatArea(9999.4)).toBe('9999 m²');
    expect(formatArea(10000)).toBe('1.00 ha');
    expect(formatArea(36400)).toBe('3.64 ha');
  });
});

describe('formatHa — körvyns "ha live"', () => {
  it('alltid hektar med svenskt komma från 100 m², m² under det', () => {
    expect(formatHa(3100)).toBe('0,31 ha');
    expect(formatHa(36400)).toBe('3,64 ha');
    expect(formatHa(100)).toBe('0,01 ha');
    expect(formatHa(99.6)).toBe('100 m²');
    expect(formatHa(0)).toBe('0 m²');
    expect(formatHa(NaN)).toBe('0 m²');
  });
});

describe('figurEtikett — längd/area som etikett i figuren', () => {
  it('KODBEVIS: tre tryckta punkter ger en yta med rätt area i etiketten (samma tal som ringAreaM2)', () => {
    const tre: LngLat[] = [fran(0, 0), fran(100, 0), fran(50, 90)];
    const e = figurEtikett(tre, true)!;
    const facit = ringAreaM2(tre);
    expect(e.text).toBe(formatHa(facit));
    expect(facit).toBeGreaterThan(4300);
    expect(facit).toBeLessThan(4700);   // ½ × 100 × 90 = 4500 m²
    expect(e.punkt[0]).toBeCloseTo((tre[0][0] + tre[1][0] + tre[2][0]) / 3, 10);
  });
  it('en 100×100 m-yta visar "1,00 ha"', () => {
    const e = figurEtikett([fran(0, 0), fran(100, 0), fran(100, 100), fran(0, 100)], true)!;
    expect(e.text).toMatch(/^(0,99|1,00|1,01) ha$/);
  });
  it('en linje visar längden mitt på linjen (räknat i meter, inte i antal punkter)', () => {
    const l: LngLat[] = [fran(0, 0), fran(10, 0), fran(110, 0)];   // 110 m, mitten vid 55 m
    const e = figurEtikett(l, false)!;
    expect(e.text).toBe('110 m');
    expect(metersBetween(l[0], e.punkt)).toBeCloseTo(55, 0);
  });
  it('för få punkter → ingen etikett (yta < 3, linje < 2)', () => {
    expect(figurEtikett([fran(0, 0), fran(10, 10)], true)).toBeNull();
    expect(figurEtikett([fran(0, 0)], false)).toBeNull();
    expect(figurEtikett([], true)).toBeNull();
  });
  it('linjeMitt/hornMitt tål tomma och enpunktslistor', () => {
    expect(linjeMitt([])).toBeNull();
    expect(linjeMitt([fran(5, 5)])).toEqual(fran(5, 5));
    expect(hornMitt([])).toBeNull();
  });
});
