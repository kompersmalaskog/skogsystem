import { describe, expect, it } from 'vitest';
import { korsparKallor, korsparLager, korsparLagerId } from './korsparLager';
import { korsparLinjerForServer } from './korspar';
import type { Koord } from './korsparKlart';
import { MITTLINJE_FILTER, kartSpar } from './sparStil';

const LAT = 56.9, M_LNG = 1 / (111_320 * Math.cos((LAT * Math.PI) / 180)), M_LAT = 1 / 111_320;
const p = (x: number, y: number): Koord => [15 + x * M_LNG, LAT + y * M_LAT];

describe('korsparKallor — tre lägen med en blick (samma regel som planeringen)', () => {
  const skordare: Koord[][] = [[p(0, 0), p(100, 0)]];
  it('skördarens band delas där skotaren kört (klar) — och är bara lila där hen inte kört', () => {
    const k = korsparKallor(skordare, [[p(0, 2), p(50, 2)]]);
    expect(k.skordare.map((f) => f.properties.klar)).toEqual([true, false]);
    expect(k.skordare.every((f) => f.properties.band === 'skordare')).toBe(true);
    expect(k.skotare).toEqual([]);   // där skotaren kört i skördarens band ritas inget eget band
  });
  it('skotaren där skördaren INTE kört får ett eget band (ute)', () => {
    const k = korsparKallor(skordare, [[p(0, 200), p(60, 200)]]);
    expect(k.skotare).toHaveLength(1);
    expect(k.skotare[0].properties.ute).toBe(true);
    expect(k.skordare.every((f) => f.properties.klar === false)).toBe(true);
  });
  it('utan skördarspår är hela skotarens spår "ute"; utan skotarspår är skördarens band bara lila', () => {
    expect(korsparKallor([], [[p(0, 0), p(50, 0)]]).skotare.every((f) => f.properties.ute === true)).toBe(true);
    expect(korsparKallor(skordare, []).skordare.every((f) => f.properties.klar === false)).toBe(true);
  });
  it('en linje med färre än två punkter ritas inte', () => {
    expect(korsparKallor([[p(0, 0)]], [])).toEqual({ skordare: [], skotare: [] });
  });
});

describe('korsparLager — samma paint som planeringen (kartSpar), ett lagerset per roll', () => {
  it('skördaren: kant (mjuk), band, mitt (filtrerad på klar); skotaren: kant + band, ingen mittlinje', () => {
    const s = korsparLager('x', 'skordare', 'kalla');
    expect(s.map((l) => l.id)).toEqual(['x-skordare-kant', 'x-skordare', 'x-skordare-mitt']);
    expect(s[2].filter).toEqual(MITTLINJE_FILTER);
    expect(korsparLager('x', 'skotare', 'kalla').map((l) => l.id)).toEqual(['x-skotare-kant', 'x-skotare']);
    const ks = kartSpar('plan', false);
    expect(s[0].paint).toEqual({ 'line-color': ks.kantFarg, 'line-opacity': ks.kantOpacitet, 'line-width': ks.kantBredd, 'line-blur': ks.kantSudd });
    expect(s[1].paint).toEqual({ 'line-color': ks.farg, 'line-opacity': ks.opacitet, 'line-width': ks.bredd });
    expect(korsparLagerId('x', 'skordare').mitt).toBe('x-skordare-mitt');
  });
  it('synlig: false lägger lagren till avstängda (objektöversiktens lagerval slår på dem)', () => {
    expect(korsparLager('x', 'skordare', 'k', false).every((l) => l.layout.visibility === 'none')).toBe(true);
    expect(korsparLager('x', 'skordare', 'k').every((l) => l.layout.visibility === 'visible')).toBe(true);
  });
  it('lagerspecarna klarar MapLibres egen stilkontroll', async () => {
    const { validateStyleMin } = await import('@maplibre/maplibre-gl-style-spec');
    const layers = [...korsparLager('x', 'skordare', 's1'), ...korsparLager('x', 'skotare', 's2')];
    const fel = validateStyleMin({ version: 8, sources: { s1: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }, s2: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } }, layers } as any);
    expect(fel.map((f: any) => f.message)).toEqual([]);
  });
});

describe('korsparLinjerForServer — avrundat till 6 decimaler (≈ 0,1 m), samma linjer', () => {
  it('ingen koordinat har fler än 6 decimaler och formen är densamma', () => {
    const pts = Array.from({ length: 60 }, (_, i) => ({ lat: 56.9 + i * 0.0000333333, lng: 15 + Math.sin(i / 7) * 0.0000444444, tid: String(i) }));
    const ut = korsparLinjerForServer(pts);
    expect(ut.length).toBe(1);
    for (const [lng, lat] of ut[0]) { expect(Math.round(lng * 1e6) / 1e6).toBe(lng); expect(Math.round(lat * 1e6) / 1e6).toBe(lat); }
    expect(ut[0][0][1]).toBeCloseTo(56.9, 5);
  });
});
