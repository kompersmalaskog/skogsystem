import { describe, expect, it } from 'vitest';
import { delaKlart, delaUtanfor, delaNara, linjerUr, KLART_RADIE_M, type LinjeFeature, type Koord } from './korsparKlart';
import { FARG } from './design/tokens';
import { kartSpar, ROLLFARG_SKORDARE, ROLLFARG_SKOTARE, MITTLINJE_FARG, MITTLINJE_BREDD, MITTLINJE_OPACITET, MITTLINJE_FILTER, STRAK_FARG, STRAK_KLAR_FARG, STRAK_KLAR_STYRKA, UTE_FARG, UTE_FILTER } from './sparStil';

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

describe('delaUtanfor (skotarens eget ljusa band, Martin 2026-11-21)', () => {
  const skordar: Koord[][] = [[p(0, 0), p(100, 0)]];
  it('bara bitarna längre än radien från skördarens spår blir kvar, märkta ute: true', () => {
    // skotaren kör 0–50 m på skördarens väg och viker sedan av 40 m åt sidan (utanför stråket)
    const skot = linje([p(0, 3), p(50, 3), p(50, 40)]);
    const ut = delaUtanfor([skot], skordar);
    expect(ut.length).toBeGreaterThan(0);
    for (const f of ut) expect(f.properties).toEqual({ ute: true });
    // all längd som blev kvar ligger längre än radien från skördarens spår (± en bit på 4 m)
    for (const f of ut) for (const c of f.geometry.coordinates) { const y = (c[1] - LAT) / M_LAT; if (Math.abs(y) < KLART_RADIE_M - 4.5) throw new Error('för nära: ' + y); }
    const langdUte = ut.reduce((s2, f) => s2 + langd(f), 0);
    expect(langdUte).toBeGreaterThan(25); expect(langdUte).toBeLessThan(40);   // sträckan från ~8 m ut till 40 m ut
  });
  it('skotare helt inom skördarens stråk ger inget eget band — där syns den som vit mittlinje', () => {
    expect(delaUtanfor([linje([p(0, 2), p(100, 2)])], skordar)).toEqual([]);
    expect(delaKlart([linje([p(0, 0), p(100, 0)])], [[p(0, 2), p(100, 2)]])[0].properties).toEqual({ klar: true });
  });
  it('saknas skördarens spår helt är hela skotarens spår ute (Elefanten på en trakt där Giant inte loggat)', () => {
    const skot = linje([p(0, 0), p(60, 0)], { dag: 'x' });
    const ut = delaUtanfor([skot], []);
    expect(ut).toHaveLength(1);
    expect(ut[0].properties).toEqual({ dag: 'x', ute: true });
    expect(ut[0].geometry.coordinates).toEqual(skot.geometry.coordinates);   // oförändrad form
  });
  it('delaNara sätter nara på varje bit och låter övriga egenskaper följa med; delaKlart är oförändrat ovanpå den', () => {
    const f = linje([p(0, 3), p(50, 3), p(50, 40)], { alder: 2 });
    const bitar = delaNara([f], skordar);
    expect(bitar.some((b) => b.properties.nara === true)).toBe(true);
    expect(bitar.some((b) => b.properties.nara === false)).toBe(true);
    expect(bitar.every((b) => b.properties.alder === 2)).toBe(true);
  });
  it('närhetsindexet byggs EN gång per samling (samma identitet = samma index) — live-ritningen delar om var 3:e sekund mot samma samling', () => {
    const mot: Koord[][] = [[p(0, 0), p(2000, 0)]];   // en lång väg: att bygga indexet är det som kostar
    delaNara([linje([p(0, 1), p(10, 1)])], mot);   // värmer
    const t0 = performance.now(); for (let i = 0; i < 200; i++) delaNara([linje([p(0, 1), p(10, 1)])], mot); const medCache = performance.now() - t0;
    const t1 = performance.now(); for (let i = 0; i < 200; i++) delaNara([linje([p(0, 1), p(10, 1)])], [[p(0, 0), p(2000, 0)]]); const utanCache = performance.now() - t1;
    expect(medCache).toBeLessThan(utanCache / 3);
  });
});

describe('kartans stil (körspåren som band i meter, 2026-11-21): lila band, vitt där skotaren kört utanför', () => {
  it('bandet är lila (skördarens färg) och vitt där `ute` — ingen grå, aldrig turkos', () => {
    for (const art of ['plan', 'egen', 'hist', 'andras'] as const) for (const lage of [false, true]) {
      const s = kartSpar(art, lage);
      expect(s.farg).toEqual(['case', UTE_FILTER, UTE_FARG, STRAK_FARG]);
      expect(s.kantFarg).toEqual(['case', UTE_FILTER, UTE_FARG, STRAK_FARG]);
      expect(JSON.stringify(s)).not.toContain(ROLLFARG_SKOTARE);
      expect(STRAK_FARG).toBe(ROLLFARG_SKORDARE);
      expect(STRAK_KLAR_FARG).toBe(ROLLFARG_SKORDARE);
      expect(UTE_FARG).toBe(FARG.text);   // vitt: inga nya färger utöver lila/vitt
      expect(STRAK_KLAR_STYRKA).toBe(1);
    }
  });
  it('mittlinjen ritas, vit och full (Martin 2026-11-11)', () => {
    expect(MITTLINJE_OPACITET).toBe(1);
    expect(MITTLINJE_FARG).toBe(FARG.text);
    expect(MITTLINJE_FILTER).toEqual(['==', ['get', 'klar'], true]);
  });
  it('alla lager validerar i MapLibre (zoom överst, exponentiell bas 2)', async () => {
    const { validateStyleMin } = await import('@maplibre/maplibre-gl-style-spec');
    const layers: any[] = [];
    for (const art of ['plan', 'egen', 'hist', 'andras'] as const) for (const l of [false, true]) {
      const s = kartSpar(art, l), id = `${art}-${l}`;
      layers.push({ id: id + '-l', type: 'line', source: 's', paint: { 'line-color': s.farg, 'line-width': s.bredd, 'line-opacity': s.opacitet } });
      layers.push({ id: id + '-c', type: 'line', source: 's', paint: { 'line-color': s.kantFarg, 'line-width': s.kantBredd, 'line-opacity': s.kantOpacitet, 'line-blur': s.kantSudd } });
    }
    layers.push({ id: 'mitt', type: 'line', source: 's', filter: MITTLINJE_FILTER, paint: { 'line-color': MITTLINJE_FARG, 'line-width': MITTLINJE_BREDD, 'line-opacity': MITTLINJE_OPACITET } });
    const fel = validateStyleMin({ version: 8, sources: { s: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } }, layers } as any);
    expect(fel.map((e: any) => e.message)).toEqual([]);
  });
});
