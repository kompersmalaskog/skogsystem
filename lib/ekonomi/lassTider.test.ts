import { describe, expect, it } from 'vitest';
import { lassSnitt, tidPerLass, tidSnitt, type TidLass, type TidPunkt } from './lassTider';

const T0 = Date.parse('2026-11-02T08:00:00Z');
const min = (n: number) => T0 + n * 60000;
// 0,001° lat ≈ 111 m. Avlägget ligger på lat 57.
const lass = (id: string, losMin: number | null, extra: Partial<TidLass> = {}): TidLass => ({
  id, maskinId: 'M', losstidMs: losMin == null ? null : min(losMin), lat: 57, lng: 15, volym: 20, breddat: false, ...extra,
});
const p = (m: number, lat: number, maskinId = 'M'): TidPunkt => ({ maskinId, tidMs: min(m), lat, lng: 15 });

describe('tid per lass ur körspåret', () => {
  // Lass b, en punkt i minuten: 10 min körning ut (666 m), 20 min lastning (kryper 3 m/min),
  // 10 min hem och 5 min vid avlägget.
  const spar: TidPunkt[] = [];
  for (let m = 0; m <= 10; m++) spar.push(p(m, 57 + 0.0006 * m));
  for (let m = 11; m <= 30; m++) spar.push(p(m, 57.006 + 0.00003 * (m - 10)));
  for (let m = 31; m <= 40; m++) spar.push(p(m, 57.0066 - 0.00064 * (m - 30)));
  for (let m = 41; m <= 45; m++) spar.push(p(m, 57.0002 - 0.00002 * (m - 40)));

  it('delar cykeln i köra, lasta och avlägg', () => {
    const [b] = tidPerLass([lass('a', 0), lass('b', 45)], spar);
    expect(b.id).toBe('b');
    // Minuterna närmast avlägget (inom 60 m) räknas dit, resten av körningen är körning.
    // Fönstret börjar EFTER förra lossningen (som SQL: tid > fran), så första minuten ut är inte med.
    expect([b.lastaMin, b.koraMin, b.avlaggMin].map(Math.round)).toEqual([20, 19, 5]);
    expect(b.pausMin).toBe(0);
    expect(b.koraMin + b.lastaMin + b.avlaggMin).toBeCloseTo(44, 5);
  });

  it('första lasset har inget fönster och får ingen tid — aldrig noll', () => {
    expect(tidPerLass([lass('a', 45)], spar)).toEqual([]);
  });

  it('mer än tre timmar sedan förra lossningen: ingen tid', () => {
    expect(tidPerLass([lass('a', -200), lass('b', 45)], spar)).toEqual([]);
  });

  it('utan spårpunkter i fönstret: ingen tid', () => {
    expect(tidPerLass([lass('a', 0), lass('b', 45)], [])).toEqual([]);
    expect(tidPerLass([lass('a', 0), lass('b', 45)], spar.map(x => ({ ...x, maskinId: 'ANNAN' })))).toEqual([]);
  });

  it('en paus över sex minuter utan rörelse i spåret räknas inte som lastning', () => {
    const [b] = tidPerLass([lass('a', 0), lass('b', 45)], [p(0, 57), p(5, 57.003), p(6, 57.0031), p(36, 57.0032), p(40, 57.0001), p(45, 57.0001)]);
    expect(Math.round(b.pausMin)).toBe(30);
    expect(b.lastaMin).toBeLessThan(2);
  });

  it('snitt kräver minst tre lass', () => {
    const t = { id: 'x', lastaMin: 20, koraMin: 10, avlaggMin: 5, pausMin: 0 };
    expect(tidSnitt([t, t])).toBeNull();
    expect(tidSnitt([t, t, { ...t, lastaMin: 26 }])).toEqual({ lass: 3, lastaMin: 22, koraMin: 10, avlaggMin: 5 });
  });

  it('snittlass och breddat', () => {
    expect(lassSnitt([])).toBeNull();
    expect(lassSnitt([lass('a', 0, { volym: 18 }), lass('b', 1, { volym: 20, breddat: true }), lass('c', 2, { volym: 0 })]))
      .toEqual({ lass: 2, snittM3: 19, breddade: 1 });
  });
});
