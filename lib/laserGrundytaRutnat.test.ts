import { describe, expect, it } from 'vitest';
import { slaUpp, utsnitt, MAX_SIDA } from './laserGrundytaRutnat';

describe('utsnitt', () => {
  it('läggs på jämna 10 m och rymmer alla punkter', () => {
    const u = utsnitt([[500003, 6300007], [500027, 6300021]])!;
    expect(u).toEqual({ minX: 500000, minY: 6300000, maxX: 500030, maxY: 6300030, bredd: 3, hojd: 3 });
  });
  it('vägrar en orimligt stor yta', () => {
    expect(utsnitt([[0, 0], [MAX_SIDA * 10 + 10, 0]])).toBeNull();
    expect(utsnitt([])).toBeNull();
  });
});

describe('slaUpp', () => {
  const u = { minX: 0, minY: 0, maxX: 30, maxY: 20, bredd: 3, hojd: 2 };
  // Rad 0 = norr: index 0..2 är norra raden.
  const g = [1, 2, 3, 4, 5, 6];
  const dia = [11, 12, 13, 14, 15, 16];
  const d = [19001, 19002, 19003, 19004, 19005, 19006];

  it('rad 0 är norr, kolumn 0 är väster', () => {
    expect(slaUpp([[25, 15]], u, g, dia, d, null)).toEqual([{ g: 3, d: 13, dag: 19003 }]); // nordost
    expect(slaUpp([[5, 5]], u, g, dia, d, null)).toEqual([{ g: 4, d: 14, dag: 19004 }]);   // sydväst
  });
  it('två punkter i samma ruta räknas en gång; punkter utanför hoppas över', () => {
    expect(slaUpp([[1, 1], [9, 9], [40, 5]], u, g, dia, d, null)).toHaveLength(1);
  });
  it('nodata, 0 som diameter och 0 som datum blir null', () => {
    expect(slaUpp([[5, 15]], u, [-9999, 0, 0, 0, 0, 0], [-9999, 0, 0, 0, 0, 0], [-9999, 0, 0, 0, 0, 0], -9999)).toEqual([{ g: null, d: null, dag: null }]);
    expect(slaUpp([[15, 15]], u, [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], -9999)).toEqual([{ g: 0, d: null, dag: null }]);
  });
});
