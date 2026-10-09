import { describe, it, expect } from 'vitest';
import { tolkaPlatsLista, tolkaNarmasteOrt } from './platsSok';

const f = (label: string, name: string, lng: number, lat: number, layer: string, distance?: number) => ({
  geometry: { coordinates: [lng, lat] }, properties: { label, name, layer, ...(distance != null ? { distance } : {}) },
});

describe('tolkaPlatsLista — "Sök fastighet" (ort/by/gård/adress)', () => {
  it('träffar med etikett + position, i Sverige, utan dubbletter, max antal', () => {
    const json = { features: [
      f('Hållsta, Emmaboda, Sverige', 'Hållsta', 15.5, 56.6, 'locality'),
      f('Hållsta, Emmaboda, Sverige', 'Hållsta', 15.5, 56.6, 'locality'),
      f('Hållsta, Paris, Frankrike', 'Hållsta', 2.35, 48.85, 'locality'),    // utanför Sverige-rutan → bort (landfiltret boundary.country=SE sitter i anropet; rutan skyddar mot 0,0)
      f('Hållstavägen 2, Nybro', 'Hållstavägen 2', 15.9, 56.7, 'address'),
    ] };
    const r = tolkaPlatsLista(json);
    expect(r.map((x) => x.etikett)).toEqual(['Hållsta, Emmaboda, Sverige', 'Hållstavägen 2, Nybro']);
    expect(r[0]).toMatchObject({ lat: 56.6, lng: 15.5, lager: 'locality' });
  });
  it('trasigt svar → tom lista, aldrig ett kast', () => {
    expect(tolkaPlatsLista(null)).toEqual([]);
    expect(tolkaPlatsLista({ features: [{ geometry: null }, { geometry: { coordinates: ['x', 1] }, properties: { label: 'a' } }, { geometry: { coordinates: [15, 56] }, properties: {} }] })).toEqual([]);
  });
  it('max begränsar', () => {
    const json = { features: Array.from({ length: 12 }, (_, i) => f('Plats ' + i, 'P' + i, 15 + i * 0.01, 56, 'locality')) };
    expect(tolkaPlatsLista(json, 3)).toHaveLength(3);
  });
});

describe('tolkaNarmasteOrt — förslag på jobbets namn', () => {
  it('det närmaste av by/gård/område, inte kommunen eller en adress', () => {
    const json = { features: [
      f('Emmaboda, Sverige', 'Emmaboda', 15.54, 56.63, 'localadmin', 7.2),
      f('Hållsta gård', 'Hållsta gård', 15.5, 56.6, 'venue', 0.9),
      f('Hållsta, Emmaboda', 'Hållsta', 15.5, 56.6, 'locality', 1.1),
      f('Vägen 1, Emmaboda', 'Vägen 1', 15.5, 56.6, 'address', 0.1),
    ] };
    expect(tolkaNarmasteOrt(json)).toEqual({ namn: 'Hållsta gård', avstandM: 900, lager: 'venue' });
  });
  it('samma avstånd (inom 100 m) → byn/gården före kommunen (lagerordning)', () => {
    const json = { features: [f('Kommun', 'Kommun', 15.5, 56.6, 'localadmin', 1.0), f('By', 'By', 15.5, 56.6, 'locality', 1.04)] };
    expect(tolkaNarmasteOrt(json)?.namn).toBe('By');
  });
  it('allt längre bort än 5 km → null (inget ortnamn "nära"); inga ortlager → null', () => {
    expect(tolkaNarmasteOrt({ features: [f('Långt', 'Långt', 15.5, 56.6, 'locality', 9.2)] })).toBeNull();
    expect(tolkaNarmasteOrt({ features: [f('Vägen 1', 'Vägen 1', 15.5, 56.6, 'address', 0.1)] })).toBeNull();
    expect(tolkaNarmasteOrt({})).toBeNull();
  });
});
