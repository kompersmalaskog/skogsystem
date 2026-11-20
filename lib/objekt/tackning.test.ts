import { describe, expect, it } from 'vitest';
import { lageDel, lageKort, lageText } from './tackning';

const nb = (s: string) => s.replace(/(\d) (?=\d{3}\b)/g, '$1 ');

describe('läget mot beställningen — samma tre ord i listan och arket', () => {
  it('lageDel: kvar, fylld, over — på avrundade tal', () => {
    expect(lageDel(379, 1000)).toEqual({ lage: 'kvar', antal: 621 });
    expect(lageDel(1000, 1000)).toEqual({ lage: 'fylld', antal: 0 });
    expect(lageDel(5037, 5000)).toEqual({ lage: 'over', antal: 37 });
    expect(lageDel(999.6, 1000)).toEqual({ lage: 'fylld', antal: 0 }); // 999,6 visas som 1 000: det som visas är det som räknas
  });

  it('listan (långt): texterna är oförändrade', () => {
    expect(lageText(379, 1000).text).toBe(nb('621 m³fub kvar till beställningen'));
    expect(lageText(1000, 1000).text).toBe('Beställningen fylld');
    expect(lageText(5037, 5000).text).toBe('Beställningen fylld · 37 m³fub över');
    expect(lageText(5, null).text).toBe('Ingen beställning inlagd');
    expect(lageText(1, 1000).fylld).toBe(false);
    expect(lageText(5037, 5000).fylld).toBe(true);
  });

  it('arket (kort): "379 inlagt · 621 kvar" / "· beställningen fylld" / "5 037 inlagt · 37 över"', () => {
    expect(lageKort(379, 1000)).toEqual({ text: '379 inlagt · 621 kvar', lage: 'kvar' });
    expect(lageKort(379, 379)).toEqual({ text: '379 inlagt · beställningen fylld', lage: 'fylld' });
    expect(lageKort(5037, 5000)).toEqual({ text: nb('5 037 inlagt · 37 över'), lage: 'over' });
  });

  it('ORDEN driftar aldrig: lista och ark får samma ord för samma tal, på en rad tal som korsar alla tre gränser', () => {
    for (const [i, b] of [[0, 100], [99, 100], [100, 100], [101, 100], [5037, 5000], [379, 1000], [1000, 1000]] as const) {
      const lista = lageText(i, b);
      const ark = lageKort(i, b);
      expect(lista.lage).toBe(ark.lage);
      expect(lista.lage).toBe(lageDel(i, b).lage);
      // och ordet står i båda texterna
      const ord = { kvar: 'kvar', fylld: 'fylld', over: 'över' }[ark.lage];
      expect(lista.text.toLowerCase()).toContain(ord);
      expect(ark.text.toLowerCase()).toContain(ord);
    }
  });
});
