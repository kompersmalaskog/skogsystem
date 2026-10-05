import { describe, it, expect } from 'vitest';
import { metersBetween, pathMeters, ringAreaM2, formatLength, formatArea, formatHa, laggTillKorPunkt, korResultat, KOR_MIN_STEG_M, KOR_SLUTEN_M, type LngLat } from './geoMat';

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

describe('mät genom att köra — start/stopp', () => {
  it('en punkt läggs bara till när maskinen rört sig minst 3 m (stillastående GPS-jitter ger inga punkter)', () => {
    expect(KOR_MIN_STEG_M).toBe(3);
    let p: LngLat[] = [];
    p = laggTillKorPunkt(p, ...fran(0, 0));
    expect(p).toHaveLength(1);
    const jitter = laggTillKorPunkt(p, ...fran(1, 1));          // 1,4 m
    expect(jitter).toBe(p);                                       // samma lista tillbaka
    p = laggTillKorPunkt(p, ...fran(0, 3.5));
    expect(p).toHaveLength(2);
  });
  it('ogiltig koordinat ignoreras', () => {
    const p: LngLat[] = [fran(0, 0)];
    expect(laggTillKorPunkt(p, NaN, 56)).toBe(p);
  });
  it('körd sträcka: 100 m rakt → 100 m, ingen yta (inte sluten)', () => {
    let p: LngLat[] = [];
    for (let y = 0; y <= 100; y += 5) p = laggTillKorPunkt(p, ...fran(0, y));
    const r = korResultat(p);
    expect(r.meter).toBeCloseTo(100, 0);
    expect(r.yta).toBeNull();
  });
  it('körd slinga som stängs (slutet inom 25 m från starten) ger också en yta', () => {
    expect(KOR_SLUTEN_M).toBe(25);
    let p: LngLat[] = [];
    const slinga: [number, number][] = [[0, 0], [50, 0], [100, 0], [100, 50], [100, 100], [50, 100], [0, 100], [0, 50], [0, 10]];
    for (const [x, y] of slinga) p = laggTillKorPunkt(p, ...fran(x, y));
    const r = korResultat(p);
    expect(r.yta).not.toBeNull();
    expect(r.yta!).toBeGreaterThan(8000);
    expect(r.yta!).toBeLessThan(10500);
    expect(r.meter).toBeGreaterThan(380);
  });
  it('slinga som INTE stängs → ingen yta', () => {
    let p: LngLat[] = [];
    for (const [x, y] of [[0, 0], [100, 0], [100, 100], [60, 100]] as [number, number][]) p = laggTillKorPunkt(p, ...fran(x, y));
    expect(korResultat(p).yta).toBeNull();
  });
});
