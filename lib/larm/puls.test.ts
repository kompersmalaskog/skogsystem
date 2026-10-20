import { describe, expect, it } from 'vitest';
import { avstandPunktM } from './geo';
import { PULS_HALV_M, PULS_PERIOD_MS, pulsData, pulsFas, pulsGeometri, pulsLagerSpecar, pulsPaint } from './puls';

const O = { lat: 56.5, lon: 14.7 };
const p = (ost: number, nord: number): [number, number] => [O.lon + ost / (111320 * Math.cos(56.5 * Math.PI / 180)), O.lat + nord / 111320];
const ll = (c: number[]) => ({ lat: c[1], lon: c[0] });
const langd = (c: number[][]) => c.slice(1).reduce((a, q, i) => a + avstandPunktM(ll(c[i]), ll(q)), 0);

describe('pulsGeometri — vad som pulserar', () => {
  it('en punkt pulserar som den är', () => {
    const g = { type: 'Point', coordinates: p(5, 5) };
    expect(pulsGeometri(g, O)).toEqual(g);
  });
  it('en yta pulserar som den är', () => {
    const g = { type: 'Polygon', coordinates: [[p(0, 0), p(10, 0), p(10, 10), p(0, 0)]] };
    expect(pulsGeometri(g, O)).toEqual(g);
  });
  it('en linje (Kraftledning, 600 m): bara ~40 m åt varje håll från närmaste punkt, inte hela linjen', () => {
    const g = { type: 'LineString', coordinates: [0, 100, 200, 300, 400, 500, 600].map((x) => p(x, 0)) };
    const u = pulsGeometri(g, { lat: O.lat + 12 / 111320, lon: g.coordinates[3][0] }) as { type: string; coordinates: number[][] };
    expect(u.type).toBe('LineString');
    expect(langd(u.coordinates)).toBeCloseTo(2 * PULS_HALV_M, 0);
    // Mitt på: sträckan är symmetrisk kring punkten 300 m in.
    const mitt = u.coordinates.reduce((a, c) => ({ lat: a.lat + c[1] / u.coordinates.length, lon: a.lon + c[0] / u.coordinates.length }), { lat: 0, lon: 0 });
    expect(avstandPunktM(mitt, ll(p(300, 0)))).toBeLessThan(25);
    // Och ingen punkt längre bort än 40 m från närmaste punkten.
    for (const c of u.coordinates) expect(avstandPunktM(ll(c), ll(p(300, 0)))).toBeLessThanOrEqual(PULS_HALV_M + 0.5);
  });
  it('sträckan flyttar sig med maskinen', () => {
    const g = { type: 'LineString', coordinates: [0, 200, 400, 600].map((x) => p(x, 0)) };
    const a = pulsGeometri(g, ll(p(100, 10))) as any;
    const b = pulsGeometri(g, ll(p(500, 10))) as any;
    expect(a.coordinates[0][0]).toBeLessThan(b.coordinates[0][0]);
  });
  it('MultiLineString: den del som ligger närmast maskinen pulserar', () => {
    const g = { type: 'MultiLineString', coordinates: [[p(0, 200), p(300, 200)], [p(0, 5), p(300, 5)]] };
    const u = pulsGeometri(g, ll(p(150, 0))) as any;
    expect(u.type).toBe('LineString');
    for (const c of u.coordinates) expect(avstandPunktM(ll(c), ll(p(150, 5)))).toBeLessThan(45);
  });
  it('saknad geometri ger ingen puls', () => {
    expect(pulsGeometri(null, O)).toBeNull();
    expect(pulsGeometri({ type: 'LineString', coordinates: [p(0, 0)] }, O)).toBeNull();
  });
});

describe('pulsFas / pulsPaint / lager', () => {
  it('mjuk upp och ned över perioden, aldrig utanför 0..1', () => {
    expect(pulsFas(0)).toBeCloseTo(0, 5);
    expect(pulsFas(PULS_PERIOD_MS / 2)).toBeCloseTo(1, 5);
    expect(pulsFas(PULS_PERIOD_MS)).toBeCloseTo(0, 5);
    for (let t = 0; t < 5000; t += 37) { const f = pulsFas(t); expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThanOrEqual(1); }
  });
  it('minskad rörelse: skenet står still', () => {
    expect(pulsFas(PULS_PERIOD_MS / 2, true)).toBe(0);
  });
  it('skenet växer och tonar när fasen går upp', () => {
    expect(pulsPaint(1).punktRadie).toBeGreaterThan(pulsPaint(0).punktRadie);
    expect(pulsPaint(1).punktOpacitet).toBeLessThan(pulsPaint(0).punktOpacitet);
  });
  it('lagren börjar på larm- (körvyns lager-whitelist) och ritar i gruppens färg ur datat', () => {
    for (const l of pulsLagerSpecar()) {
      expect(l.id.startsWith('larm-')).toBe(true);
      expect(JSON.stringify(l.paint)).toContain('"farg"');
    }
  });
  it('datat är ETT objekt, eller tomt', () => {
    expect(pulsData(null).features).toEqual([]);
    const d = pulsData({ id: 'x', farg: '#FF453A', geometri: { type: 'Point', coordinates: [1, 2] } });
    expect(d.features).toHaveLength(1);
    expect(d.features[0].properties).toEqual({ id: 'x', farg: '#FF453A' });
  });
});

describe('sidan kopplar pulsen och +-raden', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sida = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../app/planering/page.tsx'), 'utf8') as string;
  it('lagren läggs till, datat följer larm.puls, rörelsen startas om bara när det är ett annat objekt', () => {
    expect(sida).toContain('pulsLagerSpecar()');
    expect(sida).toContain('pulsData(korvyActive ? larm.puls : null)');
    expect(sida).toMatch(/\}, \[pulsId, mapLibreReady\]\)/);
  });
  it('kortet får nasta ur samma hook', () => {
    expect(sida).toContain('nasta={larm.nasta}');
  });
});
