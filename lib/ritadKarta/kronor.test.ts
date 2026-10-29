import { describe, expect, it } from 'vitest';
import { KRONA_BAS, MAX_TVA_VANINGAR, VANING_SKARV, kronor } from './kronor';
import { skak, tillSweref, type Rutnat } from './skog';

const [X0, Y0] = tillSweref(14.6, 56.5).map((v) => Math.round(v / 10) * 10);
const rutnat = (f: (k: number, r: number) => number | null, bredd = 10, hojd = 6): Rutnat => {
  const hojdDm: (number | null)[] = [];
  for (let r = 0; r < hojd; r++) for (let k = 0; k < bredd; k++) hojdDm.push(f(k, r));
  return { minX: X0, maxY: Y0, bredd, hojd, hojdDm, ar: 2021 };
};

describe('skogen i 3D: kronorna', () => {
  it('två våningar per ruta med skog: den nedre till skarven, den övre smalare till rutans egen höjd', () => {
    const rn = rutnat(() => 240);
    const k = kronor(rn, new Set(), skak);
    expect(k.length).toBe(2 * 60);
    const [nedre, ovre] = k;
    expect(nedre.bas).toBeCloseTo(24 * KRONA_BAS, 1);
    expect(nedre.hojd).toBeCloseTo(24 * VANING_SKARV, 1);
    expect(ovre.bas).toBe(nedre.hojd);
    expect(ovre.hojd).toBe(24);
    expect(nedre.klass).toBe('mogen');
    // Den övre våningen är smalare.
    const bredd = (ring: [number, number][]) => Math.max(...ring.map((p) => tillSweref(...p)[0])) - Math.min(...ring.map((p) => tillSweref(...p)[0]));
    expect(bredd(ovre.ring)).toBeLessThan(bredd(nedre.ring));
  });
  it('höjden följer rutan (höjdskillnaderna syns i krontaket)', () => {
    const rn = rutnat((k) => (k < 5 ? 120 : 260));
    const hojder = new Set(kronor(rn, new Set(), skak).filter((_, i) => i % 2 === 1).map((x) => x.hojd));
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
    expect(k.length).toBe(2 * (4 * 6 - 2));
  });
  it('samma indata ger samma skog (kartan dansar inte), och ringarna är slutna', () => {
    const rn = rutnat(() => 180);
    const a = kronor(rn, new Set(), skak);
    expect(kronor(rn, new Set(), skak)).toEqual(a);
    for (const x of a) expect(x.ring[0]).toEqual(x.ring[x.ring.length - 1]);
  });
  it('ett mycket stort utsnitt får en våning (ritningen ska gå lika fort)', () => {
    const sida = Math.ceil(Math.sqrt(MAX_TVA_VANINGAR + 1));
    const rn = rutnat(() => 200, sida, sida);
    expect(kronor(rn, new Set(), () => 0.5).length).toBe(sida * sida);
  });
});
