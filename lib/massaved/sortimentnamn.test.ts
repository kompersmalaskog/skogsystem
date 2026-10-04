import { describe, it, expect } from 'vitest';
import { sortimentEtiketter, sortimentEtikett, type SortimentNamn } from './sortimentnamn';

// De fem sortimenten ur Akelius Tåget, september 2026 (riktig data) — det fall som gav två identiska rader.
const AKELIUS: SortimentNamn[] = [
  { namn: 'Kubb: Alvesta275_V3', grupp: 'Kubb' },
  { namn: 'Kubb: Alvesta305_V3', grupp: 'Kubb' },
  { namn: 'Talltimmer: Vislanda kort V3', grupp: 'Timmer' },
  { namn: 'Timmer: Vislanda Tall_V3', grupp: 'Timmer' },
  { namn: 'Timmer: Vislanda_195_1-2_V3', grupp: 'Timmer' },
];

describe('sortimentEtiketter', () => {
  it('ger Akelius fem olika rader (förut: Timmer Vislanda ×2 och Kubb Alvesta ×2)', () => {
    const e = sortimentEtiketter(AKELIUS);
    expect(e).toEqual(['Kubb Alvesta 275', 'Kubb Alvesta 305', 'Talltimmer Vislanda kort', 'Timmer Vislanda Tall', 'Timmer Vislanda 195 1-2']);
    expect(new Set(e).size).toBe(AKELIUS.length);
  });
  it('versionsmärket (_V3 / V3) syns inte', () => {
    expect(sortimentEtiketter([{ namn: 'Massa: Bmav_V3', grupp: 'Massa' }])[0]).toBe('Massa Bmav');
    expect(sortimentEtiketter([{ namn: 'Timmer: Vislanda Tall_V3', grupp: 'Timmer' }])[0]).not.toMatch(/V3/);
  });
  it('namn utan kolon använder gruppen som prefix', () => {
    expect(sortimentEtiketter([{ namn: 'Alvesta305', grupp: 'Kubb' }])[0]).toBe('Kubb Alvesta 305');
  });
  it('identiska namn efter städningen får ordningsnummer — raderna går alltid att skilja åt', () => {
    const e = sortimentEtiketter([{ namn: 'Timmer: Vislanda_V3', grupp: 'Timmer' }, { namn: 'Timmer: Vislanda V3', grupp: 'Timmer' }]);
    expect(e).toEqual(['Timmer Vislanda (1)', 'Timmer Vislanda (2)']);
  });
  it('en enskild skärm heter som sin rad', () => {
    for (const so of AKELIUS) expect(sortimentEtikett(so, AKELIUS)).toBe(sortimentEtiketter(AKELIUS)[AKELIUS.indexOf(so)]);
  });
});
