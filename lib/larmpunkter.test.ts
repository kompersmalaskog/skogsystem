// Larmplatserna på en trakt (lib/larmpunkter). Facit: Gallring Santhe 2026 ur prod — Vida lade fem larmkoordinater, en vid varje avlägg.
import { describe, it, expect } from 'vitest';
import santhe from './__fixtures__/larmpunkter_santhe_2026-11-10.json';
import { larmpunkterUr, valjLarmpunkt, larmVisning, LARM_VALJ_SJALV, type Larmpunkt } from './larmpunkter';

const punkter = () => larmpunkterUr(santhe.features as any, santhe.objektLarm);

describe('larmpunkterUr — Santhe', () => {
  it('ger Vidas fem larmplatser, inte avläggen och inte fornlämningarna', () => {
    const p = punkter();
    expect(p).toHaveLength(5);
    expect(p.every((x) => x.kalla === 'vida')).toBe(true);
  });
  it('objektets egen larmkoordinat är en av Vidas (01-5) och blir inte en sjätte', () => {
    const p = punkter();
    expect(p.filter((x) => x.objektets)).toHaveLength(1);
    expect(p.find((x) => x.objektets)!.namn).toBe('Avlägg 01-5 · skbv tresyenshult');
  });
  it('varje larmplats heter som avlägget den ligger vid', () => {
    expect(punkter().map((x) => x.namn)).toEqual([
      'Avlägg 01-1 · skbv n karlstorp',
      'Avlägg 01-2 · byvägen söftesmåla',
      'Avlägg 01-3 · skbv gräskulla',
      'Avlägg 01-4 · skbv gräskulla öst huset',
      'Avlägg 01-5 · skbv tresyenshult',
    ]);
  });
  it('en egen larmplats långt från Vidas läggs till, märkt som objektets', () => {
    const p = larmpunkterUr(santhe.features as any, { lat: 56.6, lng: 14.8 });
    expect(p).toHaveLength(6);
    expect(p[5]).toMatchObject({ kalla: 'objekt', objektets: true, namn: null });
  });
  it('utan Vidas punkter: bara objektets (som förut)', () => {
    expect(larmpunkterUr([], { lat: 56.5, lng: 14.7 })).toEqual([{ lat: 56.5, lng: 14.7, namn: null, kalla: 'objekt', objektets: true }]);
    expect(larmpunkterUr(null, null)).toEqual([]);
  });
});

describe('valjLarmpunkt', () => {
  // Maskinen står i den östra delen, vid gräskulla öst huset (01-4).
  const vidHuset = { lat: 56.5165, lng: 14.7075 };
  it('färsk position: den närmaste, inte objektets egen 2 km bort', () => {
    const v = valjLarmpunkt(punkter(), vidHuset, true);
    expect(v.vald!.namn).toBe('Avlägg 01-4 · skbv gräskulla öst huset');
    expect(v.valjSjalv).toBe(false);
    expect(v.avstandM!).toBeLessThan(100);
  });
  it('gammal position: ingen väljs bland flera — föraren väljer själv', () => {
    const v = valjLarmpunkt(punkter(), vidHuset, false);
    expect(v.vald).toBeNull();
    expect(v.valjSjalv).toBe(true);
    expect(v.alla).toHaveLength(5);
  });
  it('ingen position: ingen väljs bland flera', () => {
    expect(valjLarmpunkt(punkter(), null, true).valjSjalv).toBe(true);
  });
  it('långt från trakten (planeraren på kontoret): ingen väljs', () => {
    const v = valjLarmpunkt(punkter(), { lat: 57.7, lng: 11.97 }, true);
    expect(v.vald).toBeNull();
    expect(v.valjSjalv).toBe(true);
  });
  it('en enda larmplats gäller alltid, med eller utan position', () => {
    const en: Larmpunkt[] = [{ lat: 56.5, lng: 14.7, namn: null, kalla: 'objekt', objektets: true }];
    expect(valjLarmpunkt(en, null, false)).toMatchObject({ vald: en[0], valjSjalv: false });
  });
  it('inga larmplatser: inget valt och inget att välja', () => {
    expect(valjLarmpunkt([], vidHuset, true)).toMatchObject({ vald: null, valjSjalv: false, alla: [] });
  });
});

describe('larmVisning', () => {
  it('närmast: namnet, avståndet och koordinaten att läsa upp', () => {
    const v = larmVisning(valjLarmpunkt(punkter(), { lat: 56.5165, lng: 14.7075 }, true));
    expect(v).toMatchObject({ satt: true, koordinat: '56.51626, 14.70847', namn: 'Avlägg 01-4 · skbv gräskulla öst huset', valjSjalv: false });
    expect(v.narmast).toMatch(/^Närmast dig · \d+ m$/);
    expect(v.platser).toHaveLength(5);
    expect(v.platser[0].narmast).toBe(true);
    expect(v.platser.slice(1).every((p) => !p.narmast)).toBe(true);
  });
  it('välj själv: ingen koordinat är vald, alla listas', () => {
    const v = larmVisning(valjLarmpunkt(punkter(), null, false));
    expect(v).toMatchObject({ satt: true, koordinat: '', namn: null, narmast: null, valjSjalv: true });
    expect(v.platser.map((p) => p.koordinat)).toContain('56.49510, 14.65453');
    expect(LARM_VALJ_SJALV).toMatch(/närmast/);
  });
  it('en enda: ingen lista och ingen "närmast"', () => {
    const v = larmVisning(valjLarmpunkt([{ lat: 56.5, lng: 14.7, namn: null, kalla: 'objekt', objektets: true }], { lat: 56.5, lng: 14.7 }, true));
    expect(v).toMatchObject({ satt: true, koordinat: '56.50000, 14.70000', narmast: null, platser: [] });
  });
});
