import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { kartOrigoFranBounds, kartOrigoMedFallback, pathTillGeoJson, svgTillGeoJson, svgToLatLon } from './kartkoordinater';
import { objektStartKamera } from './objektFlyg';

// svgToLatLon är beräkningen som läser varje markerings x/y. Ett fel här flyttar allt, flera mil (#278, #322) — den har aldrig haft ett eget test.
// Referensen nedan är planeringsvyns formel, skriven ut ordagrant ur app/planering/page.tsx (svgToLatLon, rad ~7998) och OBEROENDE av lib-filen.

type C = { lat: number; lng: number; zoom: number };
function planeringensFormel(x: number, y: number, c: C): { lat: number; lon: number } {
  const scale = 156543.03392 * Math.cos((c.lat * Math.PI) / 180) / Math.pow(2, c.zoom);
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((c.lat * Math.PI) / 180);
  const dxMeters = x * scale;
  const dyMeters = -y * scale;
  return { lat: c.lat + dyMeters / mPerDegLat, lon: c.lng + dxMeters / mPerDegLon };
}

const ORIGON: C[] = [
  { lat: 56.4579911, lng: 15.0245984, zoom: 16 },   // Betet gallring (lat/lng-origo)
  { lat: 56.1, lng: 14.1, zoom: 15 },                // kartbildens mitt
  { lat: 57.1052, lng: 14.8261, zoom: 16 },
  { lat: 0, lng: 0, zoom: 16 },
  { lat: 66.5, lng: 20, zoom: 15 },
];
const PUNKTER: [number, number][] = [[0, 0], [100, 0], [0, 100], [-250.5, 37.25], [1234, -987], [-1, -1], [0.5, 0.25]];

describe('svgToLatLon — samma tal som planeringsvyns formel', () => {
  it('ger exakt planeringens lat/lon för alla origon och punkter', () => {
    for (const c of ORIGON) {
      for (const [x, y] of PUNKTER) {
        const mitt = svgToLatLon(x, y, c);
        const ref = planeringensFormel(x, y, c);
        expect(mitt.lat, `${c.lat}/${c.zoom} ${x},${y}`).toBeCloseTo(ref.lat, 12);
        expect(mitt.lng, `${c.lat}/${c.zoom} ${x},${y}`).toBeCloseTo(ref.lon, 12);
      }
    }
  });

  it('(0, 0) är origot självt', () => {
    for (const c of ORIGON) expect(svgToLatLon(0, 0, c)).toEqual({ lat: c.lat, lng: c.lng });
  });

  it('riktningen: +x är ÖSTER (längre lng), +y är SÖDER (lägre lat) — skärmens y växer nedåt', () => {
    const c = ORIGON[0];
    expect(svgToLatLon(100, 0, c).lng).toBeGreaterThan(c.lng);
    expect(svgToLatLon(100, 0, c).lat).toBe(c.lat);
    expect(svgToLatLon(0, 100, c).lat).toBeLessThan(c.lat);
    expect(svgToLatLon(0, 100, c).lng).toBe(c.lng);
    expect(svgToLatLon(0, -100, c).lat).toBeGreaterThan(c.lat);
  });

  it('skalan: på zoom 16 vid 56,46° är en pixel 1,3198 m, och zoom 15 är exakt dubbelt så stor — 100 px = 131,98 m resp. 263,97 m rakt österut', () => {
    const c16 = { lat: 56.4579911, lng: 15.0245984, zoom: 16 };
    const c15 = { ...c16, zoom: 15 };
    const meterOster = (c: C) => (svgToLatLon(100, 0, c).lng - c.lng) * 111320 * Math.cos((c.lat * Math.PI) / 180);
    expect(meterOster(c16)).toBeCloseTo(131.98, 1);
    expect(meterOster(c15)).toBeCloseTo(263.97, 1);
    expect(meterOster(c15) / meterOster(c16)).toBeCloseTo(2, 10);
    // 100 px söderut: 111320 m per grad lat, ingen cos-faktor
    expect((c16.lat - svgToLatLon(0, 100, c16).lat) * 111320).toBeCloseTo(131.98, 1);
  });

  it('longituden skalas med cos(lat) — samma sträcka österut ger fler grader vid hög latitud', () => {
    const lag = svgToLatLon(100, 0, { lat: 0, lng: 0, zoom: 16 }).lng;
    const hog = svgToLatLon(100, 0, { lat: 60, lng: 0, zoom: 16 }).lng;
    expect(hog / lag).toBeCloseTo(1, 6);   // pixlarna krymper med cos(lat) lika mycket som graderna växer: samma antal grader per pixel
    expect(svgToLatLon(100, 0, { lat: 60, lng: 0, zoom: 16 }).lat).toBe(60);
  });

  it('svgTillGeoJson ger [lng, lat] — GeoJSON-ordningen, inte lat/lng', () => {
    const c = ORIGON[0];
    const [lng, lat] = svgTillGeoJson(10, 20, c);
    const ll = svgToLatLon(10, 20, c);
    expect(lng).toBe(ll.lng);
    expect(lat).toBe(ll.lat);
  });

  it('pathTillGeoJson hoppar över punkter utan x/y och behåller ordningen', () => {
    const c = ORIGON[1];
    const r = pathTillGeoJson([{ x: 1, y: 2 }, { x: null, y: 3 }, { y: 4 }, { x: 5, y: 6 }], c);
    expect(r).toEqual([svgTillGeoJson(1, 2, c), svgTillGeoJson(5, 6, c)]);
  });
});

describe('planeringsvyn räknar fortfarande ut samma formel (källvakt mot app/planering/page.tsx)', () => {
  const page = readFileSync(join(__dirname, '..', 'app', 'planering', 'page.tsx'), 'utf8');
  it('skalan, riktningarna och meter per grad är de som referensen ovan använder', () => {
    expect(page).toContain('const scale = 156543.03392 * Math.cos(mapCenter.lat * Math.PI / 180) / Math.pow(2, mapZoom);');
    const i = page.indexOf('const svgToLatLon = (x: number, y: number) => {');
    expect(i).toBeGreaterThan(0);
    const f = page.slice(i, i + 600);
    expect(f).toContain('const mPerDegLat = 111320;');
    expect(f).toContain('const mPerDegLon = 111320 * Math.cos(mapCenter.lat * Math.PI / 180);');
    expect(f).toContain('const dxMeters = x * scale;');
    expect(f).toContain('const dyMeters = -y * scale;');
    expect(f).toContain('const lon = mapCenter.lng + dxMeters / mPerDegLon;');
    expect(f).toContain('const lat = mapCenter.lat + dyMeters / mPerDegLat;');
  });

  it('planeringen väljer origo med objektStartKamera (en regel — egenkontrollen använder samma funktion)', () => {
    expect(page).toContain('=> objektStartKamera(obj);');
  });
});

describe('kartOrigo* — bounds mot fallback', () => {
  it('kartOrigoFranBounds: bildens mitt på zoom 15, null utan giltiga bounds (och ingen lat/lng-gissning)', () => {
    expect(kartOrigoFranBounds({ kartbild_bounds: [[56.0, 14.0], [56.2, 14.2]], lat: 1, lng: 1 })).toEqual({ lat: 56.1, lng: 14.1, zoom: 15 });
    expect(kartOrigoFranBounds({ lat: 56.4, lng: 14.7 })).toBeNull();
    expect(kartOrigoFranBounds({ kartbild_bounds: [[null, 1], [2, 3]], lat: 56.4, lng: 14.7 })).toBeNull();
  });

  it('kartOrigoMedFallback ger samma origo som objektStartKamera (planeringens regel) i alla tre fall', () => {
    for (const o of [
      { kartbild_bounds: [[56.0, 14.0], [56.2, 14.2]], lat: 56.4, lng: 14.7 },
      { lat: 56.4, lng: 14.7 },
      { lat: null, lng: null },
    ]) {
      expect(kartOrigoMedFallback(o)).toEqual(objektStartKamera(o));
    }
  });
});
