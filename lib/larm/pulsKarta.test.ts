import { describe, expect, it } from 'vitest';
import { PULS_HALV_M, PULS_PERIOD_MS, pulsData, pulsFas, pulsGeometri, pulsLagerSpecar, pulsPaint } from './pulsKarta';
import { avstandPunktM } from './geo';

const O = { lat: 56.5, lon: 14.7 };
const M_LAT = 1 / 111320, M_LON = 1 / (111320 * Math.cos(56.5 * Math.PI / 180));
const c = (ost: number, nord: number): [number, number] => [O.lon + ost * M_LON, O.lat + nord * M_LAT];

describe('pulsGeometri', () => {
  it('en linje pulserar bara sträckan närmast maskinen (~40 m åt varje håll), inte hela linjen', () => {
    const g = pulsGeometri({ type: 'LineString', coordinates: [c(-300, 15), c(300, 15)] }, O)!;
    expect(g.type).toBe('LineString');
    const k = g.coordinates as [number, number][];
    const m = (a: [number, number], b: [number, number]) => avstandPunktM({ lat: a[1], lon: a[0] }, { lat: b[1], lon: b[0] });
    let l = 0; for (let i = 0; i < k.length - 1; i++) l += m(k[i], k[i + 1]);
    expect(l).toBeCloseTo(2 * PULS_HALV_M, 0);
  });
  it('MultiLineString: den del som ligger närmast pulserar', () => {
    const g = pulsGeometri({ type: 'MultiLineString', coordinates: [[c(-500, 300), c(500, 300)], [c(-100, 10), c(100, 10)]] }, O)!;
    const k = g.coordinates as [number, number][];
    expect(Math.max(...k.map((q) => Math.abs((q[1] - O.lat) / M_LAT)))).toBeLessThan(15);   // den nära (10 m), inte den på 300 m
  });
  it('en symbol och en yta pulserar helt (orörda)', () => {
    const punkt = { type: 'Point' as const, coordinates: c(5, 5) };
    const yta = { type: 'Polygon' as const, coordinates: [[c(0, 0), c(10, 0), c(10, 10), c(0, 0)]] };
    expect(pulsGeometri(punkt, O)).toBe(punkt);
    expect(pulsGeometri(yta, O)).toBe(yta);
    expect(pulsGeometri(null, O)).toBeNull();
  });
});

describe('pulsData och pulsens lager', () => {
  it('bara det STORA larmets objekt, i dess gruppfärg; ingen puls = tom samling', () => {
    const d = pulsData({ id: 'k1', farg: '#FF453A', geometri: { type: 'Point', coordinates: c(5, 5) } }, O);
    expect(d.features).toHaveLength(1);
    expect(d.features[0].properties).toEqual({ id: 'k1', farg: '#FF453A' });
    expect(pulsData(null, O).features).toEqual([]);
    // Utan position: en linje kan inte klippas till sträckan närmast maskinen (ingen puls), men en yta/punkt pulserar helt (ⓘ-listans "flyg till ytan" utan GPS).
    expect(pulsData({ id: 'x', farg: '#fff', geometri: { type: 'LineString', coordinates: [c(0, 0), c(10, 0)] } }, null).features).toEqual([]);
    expect(pulsData({ id: 'x', farg: '#fff', geometri: { type: 'Point', coordinates: c(0, 0) } }, null).features).toHaveLength(1);
    expect(pulsData({ id: 'y', farg: '#fff', geometri: { type: 'Polygon', coordinates: [[c(0, 0), c(10, 0), c(10, 10), c(0, 0)]] } }, null).features).toHaveLength(1);
  });
  it('lagren har prefixet larm- (körvyns lager-whitelist) och färgen kommer ur featuren, aldrig en egen', () => {
    for (const l of pulsLagerSpecar()) {
      expect(l.id.startsWith('larm-')).toBe(true);
      expect(JSON.stringify(l.paint)).toContain("'farg'".replace(/'/g, '"'));
    }
  });
});

describe('pulsFas och pulsPaint — mjuk andning', () => {
  it('0 → 1 → 0 över en period, mjukt (cosinus)', () => {
    expect(pulsFas(0)).toBeCloseTo(0);
    expect(pulsFas(PULS_PERIOD_MS / 2)).toBeCloseTo(1);
    expect(pulsFas(PULS_PERIOD_MS)).toBeCloseTo(0);
    expect(pulsFas(PULS_PERIOD_MS / 4)).toBeCloseTo(0.5);
  });
  it('minskad rörelse: stilla på mitten', () => expect(pulsFas(12345, true)).toBe(0.5));
  it('paint växer med fasen: opacitet och storlek', () => {
    const a = pulsPaint(0), b = pulsPaint(1);
    expect(b['larm-puls-glod']['line-opacity']).toBeGreaterThan(a['larm-puls-glod']['line-opacity']);
    expect(b['larm-puls-punkt']['circle-radius']).toBeGreaterThan(a['larm-puls-punkt']['circle-radius']);
    expect(Object.keys(a).sort()).toEqual(pulsLagerSpecar().map((l) => l.id).sort());
  });
});
