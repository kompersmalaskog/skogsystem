import { describe, expect, it } from 'vitest';
import { VANINGAR, VANINGAR_GRANS, kronor, vaningarFor } from './kronor';
import { skak, tillSweref, type Rutnat } from './skog';

const [X0, Y0] = tillSweref(14.6, 56.5).map((v) => Math.round(v / 10) * 10);
const rutnat = (f: (k: number, r: number) => number | null, bredd = 10, hojd = 6): Rutnat => {
  const hojdDm: (number | null)[] = [];
  for (let r = 0; r < hojd; r++) for (let k = 0; k < bredd; k++) hojdDm.push(f(k, r));
  return { minX: X0, maxY: Y0, bredd, hojd, hojdDm, ar: 2021 };
};

describe('skogen i 3D: kronorna', () => {
  it('tre avsmalnande våningar per ruta med skog, den översta till rutans egen höjd', () => {
    const rn = rutnat(() => 240);
    const k = kronor(rn, new Set(), skak);
    expect(k.length).toBe(3 * 60);
    const [v1, v2, v3] = k;
    expect(v1.bas).toBeCloseTo(24 * VANINGAR[0][0], 1);
    expect(v2.bas).toBe(v1.hojd);
    expect(v3.bas).toBe(v2.hojd);
    expect(v3.hojd).toBe(24);
    expect(v1.klass).toBe('mogen');
    const bredd = (ring: [number, number][]) => Math.max(...ring.map((p) => tillSweref(...p)[0])) - Math.min(...ring.map((p) => tillSweref(...p)[0]));
    expect(bredd(v2.ring)).toBeLessThan(bredd(v1.ring));
    expect(bredd(v3.ring)).toBeLessThan(bredd(v2.ring));
  });
  it('höjden följer rutan (höjdskillnaderna syns i krontaket)', () => {
    const rn = rutnat((k) => (k < 5 ? 120 : 260));
    const hojder = new Set(kronor(rn, new Set(), skak).filter((_, i) => i % 3 === 2).map((x) => x.hojd));
    expect([...hojder].sort()).toEqual([12, 26]);
  });
  it('aldrig på hygge, avverkat eller utan data', () => {
    const rn = rutnat((k) => (k < 3 ? 5 : k < 6 ? null : 250));
    const avv = new Set([6, 7]);
    const k = kronor(rn, avv, skak);
    for (const x of k) {
      const [cx] = tillSweref(...x.ring[0]);
      expect(cx).toBeGreaterThan(X0 + 55);
    }
    expect(k.length).toBe(3 * (4 * 6 - 2));
  });
  it('samma indata ger samma skog (kartan dansar inte), och ringarna är slutna', () => {
    const rn = rutnat(() => 180);
    const a = kronor(rn, new Set(), skak);
    expect(kronor(rn, new Set(), skak)).toEqual(a);
    for (const x of a) expect(x.ring[0]).toEqual(x.ring[x.ring.length - 1]);
  });
  it('färre våningar när skogen är stor (ritningen ska gå lika fort), och toppen når alltid rutans höjd', () => {
    expect(vaningarFor(VANINGAR_GRANS.tre)).toHaveLength(3);
    expect(vaningarFor(VANINGAR_GRANS.tre + 1)).toHaveLength(2);
    expect(vaningarFor(VANINGAR_GRANS.tva + 1)).toHaveLength(1);
    for (const n of [1, VANINGAR_GRANS.tre + 1, VANINGAR_GRANS.tva + 1]) expect(vaningarFor(n).at(-1)![1]).toBe(1);
  });
});
