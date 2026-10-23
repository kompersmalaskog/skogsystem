import { describe, expect, it } from 'vitest';
import { MALLAR, bedomMall, linjeVid, mallTradslag, utfallFor, mallNamn } from './gallringsmall';

const s = (mitt: number, d = 1) => ({ mitt, lag: mitt - d, hog: mitt + d });

describe('mallarna', () => {
  it('varje mall: efter under före, svag lämnar mer än hård, andra gallringen högre än första', () => {
    for (const x of MALLAR) {
      for (const p of ['svag', 'hard'] as const) {
        for (const g of x[p]) expect(g.efter).toBeLessThan(g.fore);
        expect(x[p][1].h).toBeGreaterThan(x[p][0].h);
      }
      expect(x.svag[0].efter).toBeGreaterThan(x.hard[0].efter);
      expect(x.svag[1].efter).toBeGreaterThan(x.hard[1].efter);
      for (const l of [x.ovre, x.undre]) for (let i = 1; i < l.length; i++) expect(l[i][0]).toBeGreaterThan(l[i - 1][0]);
    }
  });
  it('linjeVid interpolerar och kläms i ändarna', () => {
    expect(linjeVid([[12, 20], [16, 24]], 14)).toBe(22);
    expect(linjeVid([[12, 20], [16, 24]], 10)).toBe(20);
    expect(linjeVid([[12, 20], [16, 24]], 30)).toBe(24);
  });
});

describe('mallTradslag', () => {
  it('gran ≥ 60 % → gran, blandat → null', () => {
    expect(mallTradslag([{ namn: 'Gran', volym: 70 }, { namn: 'Tall', volym: 30 }])?.tradslag).toBe('gran');
    expect(mallTradslag([{ namn: 'Tall', volym: 80 }, { namn: 'Björk', volym: 20 }])?.tradslag).toBe('tall');
    expect(mallTradslag([{ namn: 'Gran', volym: 50 }, { namn: 'Tall', volym: 50 }])).toBeNull();
    expect(mallTradslag([])).toBeNull();
  });
});

describe('bedomMall', () => {
  it('gran 14 m: första gallringen, rätt band ur mallarna som gallrar vid 14 m', () => {
    const r = bedomMall({ tradslag: 'gran', hojd: s(14), fore: s(28), kvar: s(20, 0.5) });
    if (r.lage !== 'ok') throw new Error(r.lage);
    expect(r.gallring).toBe(1);
    expect(r.mallar).toContain('G28');
    expect(r.efter.lag).toBeCloseTo(16.8);
    expect(r.efter.hog).toBeGreaterThanOrEqual(21);
    expect(r.utfall).toBe('inom');
    expect(r.tid).toBe('i-tid');
  });
  it('kvar under hårdaste programmet → hårdare; säker när hela spannet ligger under', () => {
    const r = bedomMall({ tradslag: 'gran', hojd: s(14), fore: s(28), kvar: s(13, 1) });
    if (r.lage !== 'ok') throw new Error(r.lage);
    expect(r.utfall).toBe('hardare');
  });
  it('kvar över svagaste → svagare', () => {
    const r = bedomMall({ tradslag: 'tall', hojd: s(14), fore: s(28), kvar: s(24, 1) });
    if (r.lage !== 'ok') throw new Error(r.lage);
    expect(r.utfall).toBe('svagare');
  });
  it('angiven gallring går före höjden', () => {
    const r = bedomMall({ tradslag: 'gran', hojd: s(15.5), fore: s(30), kvar: s(22), gallring: 2 });
    if (r.lage !== 'ok') throw new Error(r.lage);
    expect(r.gallring).toBe(2);
  });
  it('19 m utan angiven gallring → andra gallringen', () => {
    const r = bedomMall({ tradslag: 'gran', hojd: s(19), fore: s(34), kvar: s(24) });
    if (r.lage !== 'ok') throw new Error(r.lage);
    expect(r.gallring).toBe(2);
  });
  it('tidigt och sent', () => {
    const tidigt = bedomMall({ tradslag: 'gran', hojd: s(14), fore: s(20), kvar: s(17) });
    const sent = bedomMall({ tradslag: 'gran', hojd: s(14), fore: s(40), kvar: s(20) });
    if (tidigt.lage !== 'ok' || sent.lage !== 'ok') throw new Error();
    expect(tidigt.tid).toBe('tidigt');
    expect(sent.tid).toBe('sent');
  });
  it('höjd långt utanför mallarna → utanför, ingen dom', () => {
    expect(bedomMall({ tradslag: 'gran', hojd: s(8), fore: s(20), kvar: s(15) }).lage).toBe('utanfor');
    expect(bedomMall({ tradslag: 'tall', hojd: s(30), fore: s(20), kvar: s(15) }).lage).toBe('utanfor');
  });
});

describe('utfallFor', () => {
  const band = { lag: 17, hog: 22 };
  it('troligen när spannet når över gränsen', () => {
    expect(utfallFor(s(16.5, 1), band)).toBe('troligen-hardare');
    expect(utfallFor(s(22.5, 1), band)).toBe('troligen-svagare');
    expect(utfallFor(s(17.5, 1), band)).toBe('troligen-inom');
    expect(utfallFor(s(19, 1), band)).toBe('inom');
  });
  it('mallNamn', () => {
    expect(mallNamn(['G28'])).toBe('G28');
    expect(mallNamn(['G28', 'G30', 'G32'])).toBe('G28–G32');
  });
});
