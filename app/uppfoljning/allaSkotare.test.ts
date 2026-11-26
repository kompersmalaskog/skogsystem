// "Alla" vid flera skotare där en är omlastning: kvoterna räknas bara på skotningen
// (täljare och nämnare samma maskiner), totalerna på allt arbete.
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/skotarLass/koKopplad', () => ({ lasSortimentKlass: async () => false }));
import { byggAllaSkotare } from './UppfoljningVy';

const maskin = (o: any) => ({
  maskinId: 'x', namn: 'x', arOmlastning: false, skotat: 0, antalLass: 0, skotareG15h: 0, skotareG0: 0,
  skotareTomgang: 0, skotareKortaStopp: 0, skotareRast: 0, skotareM3G15h: 0, skotareLassG15h: 0,
  skotareSnittlass: 0, skotareL: 0, skotareL_M3: 0, skotareL_G15h: 0, dieselSkotare: [], lassPerDag: [], ...o,
});

describe('byggAllaSkotare', () => {
  const data = { skotat: 1000, skordareL: 0, skordat: 1100 } as any;
  const skM = [
    maskin({ maskinId: 'W', namn: 'Wisent', skotat: 1000, antalLass: 50, skotareG15h: 50, skotareL: 500 }),
    maskin({ maskinId: 'E', namn: 'Elefant', arOmlastning: true, skotat: 300, antalLass: 15, skotareG15h: 10, skotareL: 120 }),
  ];
  const r = byggAllaSkotare(data, skM as any);

  it('kvoterna räknas bara på skotningen', () => {
    expect(r.skotareM3G15h).toBe(20);      // 1000 / 50 (inte 1000 / 60)
    expect(r.skotareSnittlass).toBe(20);   // 1000 / 50 lass (inte / 65)
    expect(r.skotareLassG15h).toBe(1);     // 50 / 50
    expect(r.skotareL_M3).toBe(0.5);       // 500 / 1000
    expect(r.skotareL_G15h).toBe(10);      // 500 / 50
  });

  it('tid och diesel räknar allt arbete, också omlastningen', () => {
    expect(r.skotareG15h).toBe(60);
    expect(r.skotareL).toBe(620);
  });

  it('bara omlastning: inga kvoter, aldrig division med noll', () => {
    const r2 = byggAllaSkotare({ skotat: 0, skordareL: 0, skordat: 0 } as any, [skM[1]] as any);
    expect(r2.skotareM3G15h).toBe(0);
    expect(r2.skotareSnittlass).toBe(0);
    expect(r2.skotareL_G15h).toBe(0);
  });
});
