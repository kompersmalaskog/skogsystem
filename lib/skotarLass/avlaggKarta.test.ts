import { describe, expect, it } from 'vitest';
import { avlaggFeatures } from './avlaggKarta';

describe('avlägg på kartan', () => {
  it('en punkt per avlägg med numret och vald-flagga (ringen)', () => {
    const f = avlaggFeatures([
      { id: 'vida:2', nummer: '2', kalla: 'vida', lat: 56.6, lng: 15.8 },
      { id: 'egen:9', nummer: '3', kalla: 'egen', lat: 56.7, lng: 15.9 },
    ], 'egen:9');
    expect(f.features.map((x) => [x.properties.nummer, x.properties.vald, x.geometry.coordinates])).toEqual([['2', false, [15.8, 56.6]], ['3', true, [15.9, 56.7]]]);
  });
  it('inget valt → ingen ring', () => {
    expect(avlaggFeatures([{ id: 'vida:2', nummer: '2', kalla: 'vida', lat: 1, lng: 2 }], null).features[0].properties.vald).toBe(false);
  });
});
