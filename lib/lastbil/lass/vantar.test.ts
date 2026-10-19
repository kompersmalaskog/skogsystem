import { describe, expect, it } from 'vitest';
import { fragaGarUtFore, hamtaAntalVantandeLass, lassSaknarText } from './vantar';
import { NOTIS_FORDROJNING_MIN } from './notis';

const sb = (svar: any, anrop: any[] = []) => ({
  from: (t: string) => ({
    select: (k: string, o: any) => ({
      eq: (c: string, v: any) => ({
        lte: (c2: string, v2: any) => { anrop.push({ t, k, o, c, v, c2, v2 }); return Promise.resolve(svar); },
      }),
    }),
  }),
});

describe('märket "N lass saknar maskin"', () => {
  it('texten', () => { expect(lassSaknarText(1)).toBe('1 lass saknar maskin'); expect(lassSaknarText(3)).toBe('3 lass saknar maskin'); });
  it('räknar bara lass som väntar OCH där frågan kan ha gått ut (samma gräns som pushen)', async () => {
    const anrop: any[] = [];
    const nu = Date.parse('2026-10-14T12:00:00Z');
    expect(await hamtaAntalVantandeLass(sb({ count: 2, error: null }, anrop), nu)).toBe(2);
    expect(anrop[0]).toMatchObject({ t: 'lastbil_lass', c: 'status', v: 'vantar_maskin', c2: 'lossning_tid', v2: new Date(nu - NOTIS_FORDROJNING_MIN * 60_000).toISOString() });
    expect(anrop[0].o).toEqual({ count: 'exact', head: true });
    expect(fragaGarUtFore(nu)).toBe(anrop[0].v2);
  });
  it('läsfel är null (inget märke), aldrig 0', async () => {
    expect(await hamtaAntalVantandeLass(sb({ count: null, error: { message: 'x' } }))).toBeNull();
    expect(await hamtaAntalVantandeLass(sb({ count: null, error: null }))).toBeNull();
  });
  it('kastar aldrig (en klient utan kedjan, nätfel)', async () => {
    expect(await hamtaAntalVantandeLass({ from: () => { throw new Error('nät'); } })).toBeNull();
    expect(await hamtaAntalVantandeLass({})).toBeNull();
  });
});
