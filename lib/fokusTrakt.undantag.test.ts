// Undantagen (fara och vägar blir aldrig svaga) ska hålla även om kartans klassning av Vidas linjer ändras: idag räknas en linje som 'ignorera' i klassningen och märks därför
// aldrig — men `TraktKategori` har redan 'linje' (lib/linjeKort), och den dag linjerna klassas som ritade får de INTE bli svaga. Här tvingas klassningen att kalla linjerna 'linje'.
import { describe, expect, it, vi } from 'vitest';

vi.mock('./traktGeometri', async (orig) => {
  const m: any = await orig();
  return {
    ...m,
    klassaTraktFeature: (props: any) => (props?._typ === 'linje' ? { kategori: 'linje', kalla: 'Vida' } : m.klassaTraktFeature(props)),
  };
});

import { FOKUS_EGENSKAP, medFokus } from './fokusTrakt';

const LAT = 56, LNG = 15;
const kx = 111320 * Math.cos(LAT * Math.PI / 180), ky = 111320;
const p = (xM: number, yM: number): [number, number] => [LNG + xM / kx, LAT + yM / ky];
const TRAKT = { type: 'Feature', properties: { _lager: 'L_TRAKTDEL', _typ: 'traktgräns' }, geometry: { type: 'Polygon', coordinates: [[p(0, 0), p(100, 0), p(100, 100), p(0, 100), p(0, 0)].map((c) => c)] } };
const linje = (flb: string) => ({ type: 'Feature', properties: { _lager: 'L_TILLAGGSLINJER', _typ: 'linje', FLBESKR: flb }, geometry: { type: 'LineString', coordinates: [p(900, 0), p(1000, 0)] } });

describe('fara och vägar är undantagna även när klassningen kallar linjer "linje"', () => {
  it('kraftledning 800 m från trakten: ingen fokusegenskap', () => {
    const fc = medFokus({ features: [TRAKT, linje('Kraftledning')] });
    expect(fc.features[1].properties).not.toHaveProperty(FOKUS_EGENSKAP);
  });
  it('basväg 800 m från trakten: ingen fokusegenskap', () => {
    const fc = medFokus({ features: [TRAKT, linje('Basväg')] });
    expect(fc.features[1].properties).not.toHaveProperty(FOKUS_EGENSKAP);
  });
});
