import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
import { tradslagObjekt } from './las';
import { utfall } from './berakna';

const dim = new Map<string, Record<string, unknown>>([
  ['A', { objekt_id: 'A', object_name: 'Åbogen', huvudtyp: 'Slutavverkning' }],
  ['B', { objekt_id: 'B', object_name: 'Betet', huvudtyp: 'Gallring' }],
]);
const utf = new Map<string, Record<string, unknown>>([['A', { objekt_id: 'A', forsta: '2026-03-01' }]]);
const rad = (o: Partial<Record<string, unknown>>) => ({ objekt_id: 'A', slag: 'gran', stammar: 400, volym: 200, timmer: 120, kubb: 20, massa: 50, stammar20: 300, rot20: 0.2, ...o });

describe('tradslagObjekt', () => {
  it('räknar medelstammen på trädslagets egna stammar och lägger gran och tall var för sig', () => {
    const t = tradslagObjekt([rad({}), rad({ slag: 'tall', stammar: 250, volym: 175, timmer: 140, rot20: 0.02 })], dim, utf);
    expect(t.gran).toHaveLength(1);
    expect(t.gran[0]).toMatchObject({ namn: 'Åbogen', typ: 'Slutavverkning', medelstam: 0.5, forsta: '2026-03-01', rot20: 0.2, lov: 0 });
    expect(t.tall[0].medelstam).toBeCloseTo(0.7);
  });
  it('tar bara Vidas slutavverkningar, minst 200 stammar av trädslaget, och aldrig annat än gran och tall', () => {
    const t = tradslagObjekt([
      rad({ objekt_id: 'B' }),            // gallring
      rad({ objekt_id: 'X' }),            // inte Vida
      rad({ stammar: 199 }),              // för få granar
      rad({ slag: 'annat' }),
      rad({ volym: 0 }),
    ], dim, utf);
    expect(t.gran).toHaveLength(0);
    expect(t.tall).toHaveLength(0);
  });
  it('andelarna blir trädslagets egna i utfallet', () => {
    const objs = [0.45, 0.5, 0.55].map((m, i) => rad({ objekt_id: 'A', stammar: 400, volym: 400 * m, timmer: 400 * m * 0.6, kubb: 0, massa: 400 * m * 0.4, _i: i }));
    const t = tradslagObjekt(objs, dim, utf).gran.map((o, i) => ({ ...o, id: `A${i}` }));
    const u = utfall(t, 0.5);
    expect(u.forFa).toBe(false);
    expect(Math.round(u.andel!.timmer)).toBe(60);
  });
});
