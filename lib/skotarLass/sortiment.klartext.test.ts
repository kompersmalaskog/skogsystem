// Sortimentnamn i klartext (Martin 2026-10-26): "Kubb · Alvesta", "Massaved björk", "Talltimmer · Vislanda" — aldrig 305, _V3, 195 1-2, BmavFall.
import { afterEach, describe, expect, it } from 'vitest';
import { klartextNamn, sattSortimentKlass, sortimentDelar, sortimentVisning } from './sortiment';

afterEach(() => sattSortimentKlass([]));

const KODMARKEN = /_V\d|\b\d{2,}\b|\d-\d|Fall\b|[A-Za-z]+_[A-Za-z]/;

describe('klartextNamn: ur texten när tabellen saknar namnet', () => {
  it.each([
    ['Timmer: Vislanda_195_1-2_V3', 'Timmer · Vislanda'],
    ['Timmer: Tall_V3', 'Talltimmer'],
    ['Kubb: Tall_V3', 'Tallkubb'],
    ['Massa: BmavFall_V3', 'Massaved björk'],
    ['Massa: Gran_V3', 'Massaved gran'],
    ['Ved markägare', 'Ved markägare'],
    ['Massa: HemvedFall_V3', 'Ved markägare'],
  ])('%s → %s', (indata, ut) => { expect(klartextNamn(indata)).toBe(ut); });

  it('ett rent ord utan känd grupp visas som det är; en kod blir aldrig synlig', () => {
    expect(klartextNamn('Grovbok')).toBe('Grovbok');
    expect(klartextNamn('305 17')).toBe('Övrigt sortiment');
    expect(klartextNamn('')).toBe('');
  });
});

describe('sortimentVisning: grupp och destination ur sortimentstabellen', () => {
  it('"Kubb · Alvesta" ur tabellen — koden 305 syns aldrig', () => {
    sattSortimentKlass([{ namn: 'Kubb: Alvesta_305_V3', grupp: 'Kubb', destination: 'Alvesta' }]);
    expect(sortimentVisning('Kubb: Alvesta_305_V3')).toBe('Kubb · Alvesta');
  });
  it('"Talltimmer · Vislanda" och "Massaved björk"', () => {
    sattSortimentKlass([
      { namn: 'Timmer: Vislanda Tall_V3', grupp: 'Timmer', destination: 'Vislanda' },
      { namn: 'Massa: BmavFall_V3', grupp: 'Massaved', destination: null },
    ]);
    expect(sortimentVisning('Timmer: Vislanda Tall_V3')).toBe('Talltimmer · Vislanda');
    expect(sortimentVisning('Massa: BmavFall_V3')).toBe('Massaved björk');
  });
  it('saknas destinationen visas gruppen ("Kubb"), aldrig koden', () => {
    sattSortimentKlass([{ namn: 'Kubb: 305', grupp: 'Kubb', destination: null }]);
    expect(sortimentVisning('Kubb: 305')).toBe('Kubb');
  });
  it('samma namn på flera maskiner: raden med mest information gäller', () => {
    sattSortimentKlass([
      { namn: 'Kubb: Alvesta_305_V3', grupp: null, destination: null },
      { namn: 'Kubb: Alvesta_305_V3', grupp: 'Kubb', destination: 'Alvesta' },
    ]);
    expect(sortimentVisning('Kubb: Alvesta_305_V3')).toBe('Kubb · Alvesta');
  });
  it('två nivåer ur samma namn: sortimentet och mottagaren', () => {
    sattSortimentKlass([{ namn: 'Kubb: Alvesta_305_V3', grupp: 'Kubb', destination: 'Alvesta' }]);
    expect(sortimentDelar('Kubb: Alvesta_305_V3')).toEqual({ sortiment: 'Kubb', mottagare: 'Alvesta' });
    expect(sortimentDelar('Massa: BmavFall_V3')).toEqual({ sortiment: 'Massaved björk', mottagare: null });
  });
  it('inget namn i någon tillstånd innehåller kodmärken', () => {
    const namn = ['Timmer: Vislanda_195_1-2_V3', 'Kubb: Alvesta_305_V3', 'Massa: BmavFall_V3', 'Timmer: Tall_V3', 'Energi: Engved_509', 'Unclassified', 'Kubb: 305', 'Timmer: Vislanda_Tall_kort_V3'];
    for (const n of namn) expect(sortimentVisning(n), n).not.toMatch(KODMARKEN);
  });
});
