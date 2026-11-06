import { describe, expect, it } from 'vitest';
import { delaKlart, linjerUr, KLART_RADIE_M, type LinjeFeature, type Koord } from './korsparKlart';
import { kartSpar, ROLLFARG_SKORDARE, ROLLFARG_SKOTARE, MITTLINJE_FARG, MITTLINJE_BREDD, MITTLINJE_OPACITET, MITTLINJE_FILTER, STRAK_FARG, STRAK_KLAR_FARG, STRAK_KLAR_STYRKA } from './sparStil';

// Ett lokalt plan runt Mölleryd: 1 m österut ≈ 1/(111320·cos 56,9°) grader.
const LAT = 56.9, M_LNG = 1 / (111_320 * Math.cos((LAT * Math.PI) / 180)), M_LAT = 1 / 111_320;
const p = (x: number, y: number): Koord => [15 + x * M_LNG, LAT + y * M_LAT];
const linje = (pts: Koord[], props: Record<string, unknown> = {}): LinjeFeature => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: props });
const langd = (f: LinjeFeature) => f.geometry.coordinates.slice(1).reduce((s, c, i) => {
  const a = f.geometry.coordinates[i]; return s + Math.hypot((c[0] - a[0]) / M_LNG, (c[1] - a[1]) / M_LAT);
}, 0);

describe('delaKlart', () => {
  const strak = linje([p(0, 0), p(100, 0)], { alder: 3 });
  it('utan skotarspår är allt kvar (klar: false) och egenskaperna följer med', () => {
    const ut = delaKlart([strak], []);
    expect(ut).toHaveLength(1);
    expect(ut[0].properties).toEqual({ alder: 3, klar: false });
  });
  it('skotaren körde första halvan → två bitar, första klar', () => {
    const ut = delaKlart([strak], [[p(0, 3), p(50, 3)]]);
    expect(ut.map((f) => f.properties.klar)).toEqual([true, false]);
    expect(langd(ut[0])).toBeGreaterThan(45); expect(langd(ut[0])).toBeLessThan(58);
    expect(langd(ut[0]) + langd(ut[1])).toBeCloseTo(100, 0);
    expect(ut[0].properties.alder).toBe(3);
  });
  it('bitarna följer originalets form (samma punkter i hörnen)', () => {
    const krok = linje([p(0, 0), p(40, 0), p(40, 40)]);
    const ut = delaKlart([krok], [[p(0, 2), p(40, 2), p(40, 40)]]);
    expect(ut.every((f) => f.properties.klar)).toBe(true);
    expect(ut[0].geometry.coordinates.some((c) => Math.abs(c[0] - p(40, 0)[0]) < 1e-12 && Math.abs(c[1] - p(40, 0)[1]) < 1e-12)).toBe(true);
  });
  it('ett spår längre bort än gränsen räknas inte', () => {
    const ut = delaKlart([strak], [[p(0, KLART_RADIE_M + 3), p(100, KLART_RADIE_M + 3)]]);
    expect(ut.every((f) => f.properties.klar === false)).toBe(true);
  });
  it('en lång rak sträcka mellan två punkter (RDP-gallrad) fylls i hela vägen', () => {
    expect(delaKlart([strak], [[p(0, 0), p(100, 0)]]).map((f) => f.properties.klar)).toEqual([true]);
  });
});

describe('linjerUr', () => {
  it('tar linjerna', () => {
    expect(linjerUr([linje([p(0, 0), p(1, 1)])])).toHaveLength(1);
    expect(linjerUr(null)).toEqual([]);
  });
});

describe('kartans stil (kartan lugn 2026-11-06): ljust stråk, grått där skotaren kört', () => {
  it('stråket är ljust neutralt där det är kvar och grått och svagt där `klar` — aldrig lila, aldrig turkos', () => {
    for (const art of ['plan', 'egen', 'hist', 'andras'] as const) for (const lage of [false, true]) {
      const s = kartSpar(art, lage);
      expect(s.farg).toEqual(['case', MITTLINJE_FILTER, STRAK_KLAR_FARG, STRAK_FARG]);
      expect(JSON.stringify(s)).not.toContain(ROLLFARG_SKOTARE);
      expect(JSON.stringify(s)).not.toContain(ROLLFARG_SKORDARE);
      expect(JSON.stringify(s.opacitet)).toContain(String(STRAK_KLAR_STYRKA));
    }
  });
  it('mittlinjen ritas inte längre', () => {
    expect(MITTLINJE_OPACITET).toBe(0);
    expect(MITTLINJE_FILTER).toEqual(['==', ['get', 'klar'], true]);
  });
  it('alla lager validerar i MapLibre (zoom överst) — också skotarlägets svagare skördare', async () => {
    const { validateStyleMin } = await import('@maplibre/maplibre-gl-style-spec');
    const layers: any[] = [];
    for (const art of ['plan', 'egen', 'hist', 'andras'] as const) for (const l of [false, true]) {
      const s = kartSpar(art, l), id = `${art}-${l}`;
      layers.push({ id: id + '-l', type: 'line', source: 's', paint: { 'line-color': s.farg, 'line-width': s.bredd, 'line-opacity': s.opacitet } });
      layers.push({ id: id + '-c', type: 'line', source: 's', paint: { 'line-color': s.kantFarg, 'line-width': s.kantBredd, 'line-opacity': s.kantOpacitet } });
    }
    layers.push({ id: 'mitt', type: 'line', source: 's', filter: MITTLINJE_FILTER, paint: { 'line-color': MITTLINJE_FARG, 'line-width': MITTLINJE_BREDD, 'line-opacity': MITTLINJE_OPACITET } });
    const fel = validateStyleMin({ version: 8, sources: { s: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } }, layers } as any);
    expect(fel.map((e: any) => e.message)).toEqual([]);
  });
});
