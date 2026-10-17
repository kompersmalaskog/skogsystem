import { describe, it, expect } from 'vitest';
import { platsVarning, VARNA_OVER_KM } from './platsVarning';
import type { PlatsData } from './usePlatsData';

const DATA: PlatsData = {
  maskiner: [],
  platser: [
    { slag: 'objekt', id: 'nara', namn: 'Nära', lat: 56.401, lng: 14.601, sub: 'x' },
    { slag: 'objekt', id: 'langt', namn: 'Tjuvön AU 2026', lat: 57.5, lng: 15.5, sub: 'x' },
    { slag: 'objekt', id: 'utan', namn: 'Utan koordinat', lat: null, lng: null, sub: 'x' },
  ],
};
const PUNKT = { lat: 56.4, lng: 14.6 };
const FORE = { objekt: 'fore', plats: null };

describe('platsVarning', () => {
  it('långt från där bilen var → varning med namn och avstånd', () => {
    expect(platsVarning({ objekt: 'langt', plats: null }, FORE, PUNKT, 'där bilen lämnade maskinen', DATA))
      .toMatch(/^Tjuvön AU 2026 ligger \d+ km från där bilen lämnade maskinen\. Stämmer valet\?$/);
  });
  it('nära (≤ gränsen) → ingen varning', () => {
    expect(VARNA_OVER_KM).toBe(2);
    expect(platsVarning({ objekt: 'nara', plats: null }, FORE, PUNKT, 'x', DATA)).toBeNull();
  });
  it('oförändrat val, saknad punkt, saknad koordinat eller ej laddad data → ingen varning (aldrig en gissning)', () => {
    expect(platsVarning(FORE, FORE, PUNKT, 'x', DATA)).toBeNull();
    expect(platsVarning({ objekt: 'langt', plats: null }, FORE, { lat: null, lng: null }, 'x', DATA)).toBeNull();
    expect(platsVarning({ objekt: 'utan', plats: null }, FORE, PUNKT, 'x', DATA)).toBeNull();
    expect(platsVarning({ objekt: 'langt', plats: null }, FORE, PUNKT, 'x', null)).toBeNull();
  });
});
