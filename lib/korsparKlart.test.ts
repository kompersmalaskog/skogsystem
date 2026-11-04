import { describe, expect, it } from 'vitest';
import { delaKlart, utanforStrak, linjerUr, KLART_RADIE_M, type LinjeFeature, type Koord } from './korsparKlart';
import { kartSpar, medKlart, dampatSpar, STRAK_KLAR_FARG, SKOTAR_BAND_FARG, ROLLFARG_SKOTARE } from './sparStil';

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

describe('utanforStrak', () => {
  it('bara delen utanför stråken blir band', () => {
    const skot = [[p(0, 0), p(50, 0), p(50, 60)]];
    const ut = utanforStrak(skot, [[p(0, 0), p(50, 0)]]);
    expect(ut).toHaveLength(1);
    expect(langd(ut[0])).toBeGreaterThan(40);
    expect(ut[0].geometry.coordinates.every((c) => (c[1] - LAT) / M_LAT > KLART_RADIE_M)).toBe(true);
  });
  it('helt på stråken → inget band; utan stråk → hela spåret', () => {
    expect(utanforStrak([[p(0, 1), p(80, 1)]], [[p(0, 0), p(80, 0)]])).toEqual([]);
    expect(utanforStrak([[p(0, 0), p(10, 0), p(20, 0)]], [])).toHaveLength(1);
  });
  it('linjerUr tar linjerna', () => {
    expect(linjerUr([linje([p(0, 0), p(1, 1)])])).toHaveLength(1);
    expect(linjerUr(null)).toEqual([]);
  });
});

describe('kartans stil: blått betyder vatten', () => {
  it('skotaren ritas aldrig i sin turkosa rollfärg på kartan', () => {
    for (const art of ['plan', 'egen', 'hist', 'andras'] as const) {
      for (const lage of [false, true]) {
        const s = kartSpar('skotare', art, lage);
        expect(s.farg).toBe(SKOTAR_BAND_FARG);
        expect(JSON.stringify(s)).not.toContain(ROLLFARG_SKOTARE);
        expect(s.kantOpacitet).toBe(0);
      }
    }
  });
  it('skördaren: rollfärg där kvar, grått och utan kant där klar', () => {
    const s = kartSpar('skordare', 'plan');
    expect(s.farg).toEqual(['case', ['==', ['get', 'klar'], true], STRAK_KLAR_FARG, dampatSpar('skordare', 'plan').farg]);
    // zoom-uttrycket ligger överst (MapLibre kräver det) och varje stopp är ett case
    expect((s.bredd as any[])[0]).toBe('interpolate');
    expect((s.kantOpacitet as any[])[0]).toBe('interpolate');
    const stopp = (s.kantOpacitet as any[]).slice(3).filter((_, i) => i % 2 === 1);
    expect(stopp.every((v: any) => Array.isArray(v) && v[0] === 'case' && v[2] === 0)).toBe(true);
  });
  it('medKlart av ett tal ger ett case direkt', () => {
    const s = medKlart({ farg: '#000', bredd: 3, opacitet: 1, kantFarg: '#000', kantBredd: 5, kantOpacitet: 0.8 });
    expect(s.bredd).toEqual(['case', ['==', ['get', 'klar'], true], 3 * 0.66, 3]);
    expect(s.kantOpacitet).toEqual(['case', ['==', ['get', 'klar'], true], 0, 0.8]);
  });
});
