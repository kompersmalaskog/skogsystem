import { describe, it, expect } from 'vitest';
import { platsAvstand, traktMeddelande, VARNA_OVER_KM } from './platsVarning';
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

describe('platsAvstand', () => {
  it('långt från där bilen var → namn och avstånd', () => {
    const a = platsAvstand({ objekt: 'langt', plats: null }, FORE, PUNKT, DATA);
    expect(a?.namn).toBe('Tjuvön AU 2026');
    expect(a!.km).toBeGreaterThan(100);
  });
  it('nära (≤ gränsen) → inget', () => {
    expect(VARNA_OVER_KM).toBe(2);
    expect(platsAvstand({ objekt: 'nara', plats: null }, FORE, PUNKT, DATA)).toBeNull();
  });
  it('oförändrat val, saknad punkt, saknad koordinat eller ej laddad data → inget (aldrig en gissning)', () => {
    expect(platsAvstand(FORE, FORE, PUNKT, DATA)).toBeNull();
    expect(platsAvstand({ objekt: 'langt', plats: null }, FORE, { lat: null, lng: null }, DATA)).toBeNull();
    expect(platsAvstand({ objekt: 'utan', plats: null }, FORE, PUNKT, DATA)).toBeNull();
    expect(platsAvstand({ objekt: 'langt', plats: null }, FORE, PUNKT, null)).toBeNull();
  });
});

describe('traktMeddelande — allt om en ändrad trakt som EN text', () => {
  const lamnades = { namn: 'Bjällerhult', km: 6.2, ord: 'där maskinen lämnades' };
  it('avstånd + sträcka från gamla trakten: en mening', () => {
    expect(traktMeddelande({ avstand: [lamnades], koord: { matt: 15, gamla: ['Åbogen'] } }))
      .toBe('Bjällerhult ligger 6 km från där maskinen lämnades, och sträckan 15 km räknades från Åbogen. Stämmer valet?');
  });
  it('bara avstånd', () => {
    expect(traktMeddelande({ avstand: [lamnades], koord: null })).toBe('Bjällerhult ligger 6 km från där maskinen lämnades. Stämmer valet?');
  });
  it('bara sträckan från gamla trakten — börjar med stor bokstav', () => {
    expect(traktMeddelande({ avstand: [], koord: { matt: 15, gamla: ['Åbogen'] } })).toBe('Sträckan 15 km räknades från Åbogen. Stämmer valet?');
  });
  it('båda ändarna ändrade: båda avstånden och båda gamla trakterna', () => {
    expect(traktMeddelande({
      avstand: [{ namn: 'A', km: 3, ord: 'där maskinen hämtades' }, lamnades],
      koord: { matt: null, gamla: ['X', 'Y'] },
    })).toBe('A ligger 3 km från där maskinen hämtades, och Bjällerhult ligger 6 km från där maskinen lämnades, och sträckan räknades från X och Y. Stämmer valet?');
  });
  it('inget att säga → null', () => {
    expect(traktMeddelande({ avstand: [], koord: null })).toBeNull();
    expect(traktMeddelande({ avstand: [], koord: { matt: 15, gamla: [] } })).toBeNull();
  });
});
