import { describe, expect, it } from 'vitest';
import { historikSortimentRader, objektSortimentRader, ordnaMestAnvanda, sortimentVal, traktAnvandning, VED_MARKAGARE_NYCKEL, type SkordatSortiment } from './sortiment';

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

describe('"Lägg till": traktens egna sortiment, mest använda först', () => {
  const lassMed = (status: string, ...nycklar: string[]) => ({ status, delar: [{ rader: nycklar.map((nyckel) => ({ nyckel })) }] });

  it('räknar användning på trakten: lass som räknas + Opti-lassens rader, aldrig strukna', () => {
    const per = traktAnvandning([lassMed('bekraftat', 'tall', 'massa'), lassMed('vantar_forare', 'tall'), lassMed('struket', 'massa', 'massa')], ['Tall', 'Massa']);
    expect(per.get('tall')).toBe(3);
    expect(per.get('massa')).toBe(2);
  });
  it('skördat: mest använda på trakten först, inte störst skördat — och lika många: skördat störst först', () => {
    const sk2 = [sk('Kubb', 90), sk('Tall', 50), sk('Massa', 40), sk('Gran', 10)];
    const v = sortimentVal({ skordat: sk2, objekt: [], historik: null, traktAnvandning: new Map([['massa', 5], ['tall', 2]]) });
    expect(v.primara.map((r) => r.nyckel)).toEqual(['massa', 'tall', 'kubb', 'gran']);
  });
  it('inget använt på trakten: senaste 12 månaderna avgör, sist listans egen ordning', () => {
    const sk2 = [sk('Kubb', 90), sk('Tall', 50), sk('Massa', 40)];
    const v = sortimentVal({ skordat: sk2, objekt: [], historik: [{ nyckel: 'massa', namn: 'Massa', antal: 900 }, { nyckel: 'tall', namn: 'Tall', antal: 30 }] });
    expect(v.primara.map((r) => r.nyckel)).toEqual(['massa', 'tall', 'kubb']);
  });
  it('trakten går före historiken: mindre använt på trakten men inget i historiken slår inte mer använt på trakten', () => {
    const rader = [{ nyckel: 'a', namn: 'A', m3: 0 }, { nyckel: 'b', namn: 'B', m3: 0 }];
    expect(ordnaMestAnvanda(rader, new Map([['b', 1]]), [{ nyckel: 'a', namn: 'A', antal: 5000 }]).map((r) => r.nyckel)).toEqual(['b', 'a']);
  });
  it('ändrar inte listans innehåll, bara ordningen; "alla" följer de primära först', () => {
    const v = sortimentVal({ skordat: [sk('Tall', 5), sk('Massa', 4)], objekt: ['Gran timmer · Urshult'], historik: null, traktAnvandning: new Map([['massa', 3]]) });
    expect(v.alla.map((r) => r.nyckel).slice(0, 3)).toEqual(['massa', 'tall', 'gran timmer · urshult']);
  });
});
