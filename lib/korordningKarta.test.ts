import { describe, it, expect } from 'vitest';
import * as spec from '@maplibre/maplibre-gl-style-spec';
import { korBredd, korFarg, KOR_OPACITET, KOR_INTE_KLAR, korSkenLager, korPunktLager, korPunkter, KOR_KALLA, KOR_PIL_BILD } from './korordningKarta';
import { KLART_FARG, KLART_LINJE_OPACITET } from './kartKlart';
import { medKor, korVagUr, type KorVag } from './korordning';

const LW = ['interpolate', ['linear'], ['zoom'], 5, 2, 8, 2, 11, 3, 13, 4, 15, 6, 17, 7];
const F = (kor?: string) => ({ type: 'Feature', properties: kor ? { kor } : {}, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } } as any);
const utvardera = (uttryck: any, typ: 'number' | 'color', kor: string | undefined, zoom = 15) => {
  const r = spec.expression.createPropertyExpression(uttryck, { type: typ, 'property-type': 'data-driven', expression: { interpolated: true, parameters: ['zoom', 'feature'] } } as any);
  if (r.result !== 'success') throw new Error(JSON.stringify((r as any).value));
  return (r.value as any).evaluate({ zoom }, F(kor));
};

describe('uttrycken är giltiga MapLibre-uttryck', () => {
  it('bredd, färg, styrka och filter', () => {
    // bara nu är tjockare; nästa, kommande, körd och en väg utan siffra ritas som vanligt (inga tunna linjer)
    expect(utvardera(korBredd(LW), 'number', undefined)).toBe(6);
    expect(utvardera(korBredd(LW), 'number', 'nu')).toBeCloseTo(9);
    expect(utvardera(korBredd(LW), 'number', 'nasta')).toBe(6);
    expect(utvardera(korBredd(LW), 'number', 'kommande')).toBe(6);
    expect(utvardera(korBredd(LW), 'number', 'klar')).toBe(6);
    // interpolationen mellan stoppen består (zoom 14 = mitt emellan 4 och 6)
    expect(utvardera(korBredd(LW), 'number', undefined, 14)).toBe(5);
    expect(utvardera(korBredd(LW), 'number', 'nu', 14)).toBeCloseTo(7.5);
    expect(utvardera(korBredd(LW), 'number', 'nasta', 14)).toBe(5);
  });
  it('en körd väg är grå och svagare, andra rörs inte', () => {
    expect(utvardera(korFarg('#3b82f6'), 'color', undefined).toString()).toBe('rgba(59,130,246,1)');
    expect(utvardera(korFarg('#3b82f6'), 'color', 'nu').toString()).toBe('rgba(59,130,246,1)');
    const grå = utvardera(korFarg('#3b82f6'), 'color', 'klar');
    const [r, g, b] = [grå.r, grå.g, grå.b];
    const k = spec.expression.createPropertyExpression(KLART_FARG as any, { type: 'color', 'property-type': 'constant', expression: { interpolated: false, parameters: [] } } as any);
    const mal = (k.value as any).evaluate({ zoom: 15 }, F());
    expect([r, g, b]).toEqual([mal.r, mal.g, mal.b]);
    expect(utvardera(KOR_OPACITET, 'number', 'klar')).toBe(KLART_LINJE_OPACITET);
    expect(utvardera(KOR_OPACITET, 'number', 'nu')).toBe(1);
    expect(utvardera(KOR_OPACITET, 'number', undefined)).toBe(1);
  });
  it('basvägens gula streck göms bara på en körd väg', () => {
    const f = spec.featureFilter(KOR_INTE_KLAR).filter;
    expect(f({ zoom: 15 }, F('klar'))).toBe(false);
    expect(f({ zoom: 15 }, F('nu'))).toBe(true);
    expect(f({ zoom: 15 }, F())).toBe(true);
  });
  it('hela stilen med lagren validerar utan fel', () => {
    const stil: any = {
      version: 8, glyphs: 'https://x/{fontstack}/{range}.pbf', sprite: undefined,
      sources: { l: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }, [KOR_KALLA]: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
      layers: [
        { id: 'a', type: 'line', source: 'l', paint: { 'line-width': korBredd(LW), 'line-color': korFarg('#fff'), 'line-opacity': KOR_OPACITET } },
        korSkenLager('l'), ...korPunktLager(),
      ],
    };
    delete stil.sprite;
    const fel = spec.validateStyleMin(stil).filter((e: any) => !/image|sprite/i.test(String(e.message)));
    expect(fel).toEqual([]);
  });
});

const vag = (id: string, ordning: number | null, coords: [number, number][], opts: Partial<KorVag> = {}): KorVag => ({ id, ordning, bak: false, klar: false, coords, ...opts });
const A: [number, number][] = [[14.0, 56.0], [14.002, 56.0]];   // ca 123 m
const B: [number, number][] = [[14.0, 56.001], [14.002, 56.001]];
const C: [number, number][] = [[14.0, 56.002], [14.002, 56.002]];
const D: [number, number][] = [[14.0, 56.003], [14.002, 56.003]];

describe('korPunkter', () => {
  const vagar = [vag('a', 1, A, { klar: true }), vag('b', 2, B), vag('c', 3, C), vag('d', 4, D), vag('e', null, A)];
  const slag = (fc: any, id?: string) => fc.features.filter((f: any) => !id || f.properties.id === id).map((f: any) => f.properties.slag);
  it('körvyn: nu har pilar och "m kvar", nästa har siffra, kommande och klar ingenting', () => {
    const fc = korPunkter({ vagar, lage: 'korvy', tMs: 0 });
    const nu = slag(fc, 'b');
    expect(nu.filter((s: string) => s === 'pil').length).toBeGreaterThan(1);
    expect(nu).toContain('kvar');
    expect(nu).not.toContain('siffra');
    expect(slag(fc, 'c')).toEqual(['siffra']);
    expect(slag(fc, 'd')).toEqual([]);
    expect(slag(fc, 'a')).toEqual([]);
    expect(slag(fc, 'e')).toEqual([]);
  });
  it('pilarna glider: andra tider ger andra platser, men lika många', () => {
    const t0 = korPunkter({ vagar, lage: 'korvy', tMs: 0 }).features.filter((f: any) => f.properties.slag === 'pil');
    const t1 = korPunkter({ vagar, lage: 'korvy', tMs: 1500 }).features.filter((f: any) => f.properties.slag === 'pil');
    expect(t1[0].geometry.coordinates).not.toEqual(t0[0].geometry.coordinates);
    expect(t1[0].properties.riktning).toBeCloseTo(90, 0);        // vägen går österut
  });
  it('statisk: pilarna står stilla', () => {
    const t0 = korPunkter({ vagar, lage: 'korvy', tMs: 0, statisk: true }).features;
    const t1 = korPunkter({ vagar, lage: 'korvy', tMs: 4000, statisk: true }).features;
    expect(t1).toEqual(t0);
  });
  it('planeringen: siffra och fast pil på varje väg i ordningen utom körda', () => {
    const fc = korPunkter({ vagar, lage: 'planering', tMs: 123 });
    expect(slag(fc, 'a')).toEqual([]);
    for (const id of ['b', 'c', 'd']) { expect(slag(fc, id)).toContain('siffra'); expect(slag(fc, id)).toContain('pil'); }
    expect(slag(fc, 'e')).toEqual([]);
    expect(slag(fc)).not.toContain('kvar');
  });
  it('bakåt: pilarna pekar åt andra hållet', () => {
    const fc = korPunkter({ vagar: [vag('b', 1, B, { bak: true })], lage: 'korvy', tMs: 0 });
    expect(fc.features.find((f: any) => f.properties.slag === 'pil')!.properties.riktning).toBeCloseTo(270, 0);
  });
  it('allt klart: inget ritas', () => {
    expect(korPunkter({ vagar: [vag('a', 1, A, { klar: true })], lage: 'korvy', tMs: 0 }).features).toEqual([]);
  });
});

describe('lagren ligger i körvyns whitelist och är kända', () => {
  it('alla id:n börjar på line-', () => {
    for (const l of [korSkenLager('l'), ...korPunktLager()]) expect(l.id.startsWith('line-')).toBe(true);
    expect(KOR_PIL_BILD).toBe('kor-pil');
  });
  it('medKor + korVagUr hänger ihop', () => {
    const m = medKor({ id: 5 }, { ordning: 2, riktningBak: true });
    expect(korVagUr(m, A)).toMatchObject({ id: '5', ordning: 2, bak: true, klar: false });
  });
});
