import { describe, expect, it } from 'vitest';
import { historikSortimentRader, objektSortimentRader, sortimentVal, VED_MARKAGARE_NYCKEL, type SkordatSortiment } from './sortiment';

const sk = (namn: string, m3 = 10): SkordatSortiment => ({ nyckel: namn.toLowerCase(), namn, m3 });
const hist = [
  { nyckel: 'vislanda kort v3', namn: 'Vislanda kort V3', antal: 1200 },
  { nyckel: 'bmavfall_v3', namn: 'BmavFall_V3', antal: 300 },
  { nyckel: 'engvedfallövlöv', namn: 'EngvedFallÖvLöv', antal: 40 },
];
const objekt = ['Gran timmer · Urshult', 'Massa · Björk', '  ', 'gran timmer · urshult'];

describe('sortimentVal: kedjan skördat → objektets → senaste 12 månaderna', () => {
  it('skördat finns: det gäller först; reserven ligger bara i "alla"', () => {
    const v = sortimentVal({ skordat: [sk('Timmer: Tall_V3', 50)], objekt, historik: hist });
    expect(v.kalla).toBe('skordat');
    expect(v.primara.map((r) => r.nyckel)).toEqual(['timmer: tall_v3']);
    expect(v.alla.map((r) => r.nyckel)).toEqual(['timmer: tall_v3', 'gran timmer · urshult', 'massa · björk', 'vislanda kort v3', 'bmavfall_v3', 'engvedfallövlöv', VED_MARKAGARE_NYCKEL]);
  });
  it('inget skördat: objektets sortiment (tomma och dubbletter bort)', () => {
    const v = sortimentVal({ skordat: [], objekt, historik: hist });
    expect(v.kalla).toBe('objekt');
    expect(v.primara.map((r) => r.namn)).toEqual(['Gran timmer · Urshult', 'Massa · Björk']);
  });
  it('varken skördat eller objektets: de mest använda senaste 12 månaderna, flest först', () => {
    const v = sortimentVal({ skordat: null, objekt: [], historik: [...hist].reverse() });
    expect(v.kalla).toBe('historik');
    expect(v.primara.map((r) => r.nyckel)).toEqual(['vislanda kort v3', 'bmavfall_v3', 'engvedfallövlöv']);
  });
  it('bara "Unclassified" skördat räknas inte som skördat', () => {
    const v = sortimentVal({ skordat: [sk('Unclassified', 3)], objekt, historik: null });
    expect(v.kalla).toBe('objekt');
    expect(v.alla.map((r) => r.nyckel)).not.toContain('unclassified');
  });
  it('ingenting alls: primära tomma men "alla" har ändå Ved markägare — föraren fastnar aldrig helt', () => {
    const v = sortimentVal({ skordat: null, objekt: null, historik: null });
    expect(v.kalla).toBe('ingen');
    expect(v.primara).toEqual([]);
    expect(v.alla.map((r) => r.nyckel)).toEqual([VED_MARKAGARE_NYCKEL]);
  });
  it('ingen nyckel förekommer två gånger i "alla"', () => {
    const v = sortimentVal({ skordat: [sk('Massa · Björk')], objekt, historik: [{ nyckel: 'massa · björk', namn: 'Massa · Björk', antal: 5 }] });
    const n = v.alla.map((r) => r.nyckel);
    expect(new Set(n).size).toBe(n.length);
  });
  it('hjälparna: markägarens ved i objektets lista får sitt eget namn, historiken tål tomt', () => {
    expect(objektSortimentRader(['Hemved'])[0]).toMatchObject({ nyckel: VED_MARKAGARE_NYCKEL, namn: 'Ved markägare' });
    expect(objektSortimentRader(null)).toEqual([]);
    expect(historikSortimentRader(null)).toEqual([]);
  });
});
