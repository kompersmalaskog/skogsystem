import { describe, it, expect } from 'vitest';
import { berakna, klassFor, radUtbyte, tolkaLangd, jamforRapport, type Cell, type Rad } from './berakna';

// Syntetiska celler: räknelogiken, inte datan. Jeppshoka-provet mot riktig
// data ligger i PR:en (SQL, modellen byggd utan Jeppshoka).
const cell = (slag: string, klass: number, rot: Cell['rot'], stammar: number, m3: number,
              t: number, k: number, m: number): Cell =>
  ({ slag, klass, rot, stammar, objekt: 10, m3_per_stam: m3, timmer_pct: t, kubb_pct: k, massa_pct: m,
     ovrigt_pct: 100 - t - k - m });

const celler: Cell[] = [
  cell('gran', 10, 'alla', 10829, 0.062, 0, 2, 87),
  cell('gran', 15, 'alla', 13508, 0.165, 1, 37, 53),
  cell('gran', 20, 'alla', 15280, 0.332, 19.5, 46.3, 27.8),
  cell('gran', 20, 'ja',   4793, 0.315, 3.8, 31.1, 65.0),
  cell('gran', 20, 'nej', 10487, 0.339, 26.1, 52.8, 17.6),
  cell('gran', 30, 'alla', 10338, 0.788, 64.1, 15.3, 16.2),
  cell('gran', 30, 'ja',   3209, 0.754, 38.2, 15.2, 46.5),
  cell('gran', 30, 'nej',  7129, 0.803, 75.0, 15.3, 7.3),
  cell('gran', 50, 'alla',  379, 1.890, 79.2, 3.7, 12.5),
  cell('gran', 50, 'ja',    102, 1.565, 50.3, 4.1, 45.4),   // ja ≥ 50, nej ≥ 50 → blandas
  cell('gran', 50, 'nej',   277, 2.009, 87.6, 3.6, 4.3),
  cell('tall', 30, 'alla', 3085, 0.752, 72.9, 12.2, 12.4),
  cell('tall', 30, 'ja',    266, 0.629, 28.8, 10.5, 60.5),
  cell('tall', 30, 'nej',  2819, 0.764, 76.3, 13.4, 9.8),
  cell('tall', 45, 'alla',  339, 1.478, 85.5, 1.4, 11.6),
  cell('tall', 45, 'ja',     15, 1.337, 42.2, 1.2, 56.7),   // för få → 'alla' används
  cell('tall', 45, 'nej',   324, 1.485, 87.3, 2.0, 10.2),
];
const meta = { rot20_median: 0.241, rot20_q1: 0.177, rot20_q3: 0.309 };

describe('klassFor', () => {
  it('mappar klassmitt till 5 cm-klass, extrapolerar över 55', () => {
    expect(klassFor(12)).toEqual({ klass: 10, extrapolerad: false });
    expect(klassFor(24)).toEqual({ klass: 20, extrapolerad: false });
    expect(klassFor(26)).toEqual({ klass: 25, extrapolerad: false });
    expect(klassFor(54)).toEqual({ klass: 50, extrapolerad: false });
    expect(klassFor(56)).toEqual({ klass: 50, extrapolerad: true });
    expect(klassFor(64)).toEqual({ klass: 50, extrapolerad: true });
    expect(klassFor(8)).toEqual({ klass: 5, extrapolerad: false });
  });
});

describe('radUtbyte', () => {
  it('utan rötandel används datans egen blandning', () => {
    const u = radUtbyte({ slag: 'gran', cm: 32, antal: 100 }, celler, null);
    expect(u.vol).toBeCloseTo(78.8, 5);
    expect(u.timmer).toBeCloseTo(78.8 * 0.641, 5);
    expect(u.rotBlandad).toBe(false);
  });
  it('rötandel 0 = bara friska, 1 = bara rotkapade', () => {
    const friska = radUtbyte({ slag: 'gran', cm: 32, antal: 100 }, celler, 0);
    const rot = radUtbyte({ slag: 'gran', cm: 32, antal: 100 }, celler, 1);
    expect(friska.vol).toBeCloseTo(80.3, 5);
    expect(friska.timmer).toBeCloseTo(80.3 * 0.75, 5);
    expect(rot.vol).toBeCloseTo(75.4, 5);
    expect(rot.timmer).toBeCloseTo(75.4 * 0.382, 5);
    expect(friska.rotBlandad && rot.rotBlandad).toBe(true);
  });
  it('blandar linjärt', () => {
    const u = radUtbyte({ slag: 'gran', cm: 32, antal: 1 }, celler, 0.5);
    expect(u.timmer).toBeCloseTo(0.5 * 0.754 * 0.382 + 0.5 * 0.803 * 0.75, 6);
  });
  it('under 20 cm blandas inte — där är första stocken massaved av dimension', () => {
    const u = radUtbyte({ slag: 'gran', cm: 16, antal: 10 }, celler, 0.9);
    expect(u.rotBlandad).toBe(false);
    expect(u.vol).toBeCloseTo(1.65, 5);
  });
  it('för få stammar i ja/nej → alla, och märks inte som blandad', () => {
    const u = radUtbyte({ slag: 'tall', cm: 46, antal: 2 }, celler, 0.3);
    expect(u.rotBlandad).toBe(false);
    expect(u.vol).toBeCloseTo(2 * 1.478, 5);
  });
  it('över 55 cm räknas som 50–55 och märks extrapolerad', () => {
    const u = radUtbyte({ slag: 'gran', cm: 60, antal: 1 }, celler, null);
    expect(u.extrapolerad).toBe(true);
    expect(u.klass).toBe(50);
    expect(u.vol).toBeCloseTo(1.89, 5);
  });
  it('övrigt barr räknas som gran', () => {
    const a = radUtbyte({ slag: 'ovrigt_barr', cm: 32, antal: 3 }, celler, null);
    const b = radUtbyte({ slag: 'gran', cm: 32, antal: 3 }, celler, null);
    expect(a.vol).toBe(b.vol);
  });
  it('klass utan data → saknas, noll volym', () => {
    const u = radUtbyte({ slag: 'tall', cm: 20, antal: 5 }, celler, null);
    expect(u.saknas).toBe(true);
    expect(u.vol).toBe(0);
  });
});

describe('berakna', () => {
  const rader: Rad[] = [
    { slag: 'gran', cm: 32, antal: 100 }, { slag: 'gran', cm: 60, antal: 2 },
    { slag: 'tall', cm: 32, antal: 10 }, { slag: 'tall', cm: 46, antal: 1 },
    { slag: 'ovrigt_barr', cm: 16, antal: 4 },
  ];
  it('summerar, håller trädslagen isär och använder medianen som standard', () => {
    const r = berakna(rader, celler, meta, null);
    expect(r.trad).toBe(117);
    expect(r.rot).toBe(0.241);
    expect(r.rotStandard).toBe(true);
    expect(r.perSlag.tall.trad).toBe(11);
    expect(r.perSlag.gran.trad).toBe(106);   // övrigt barr landar på gran
    expect(r.total.vol).toBeCloseTo(r.perSlag.tall.vol + r.perSlag.gran.vol, 9);
    expect(r.extrapoleradeTrad).toBe(2);
    expect(r.tuntTrad).toBe(0);
    expect(r.saknadeTrad).toBe(0);
  });
  it('spannet ligger mellan kvartilerna och innehåller resultatet', () => {
    const r = berakna(rader, celler, meta, null);
    expect(r.spann).not.toBeNull();
    const [lag, hog] = r.spann!.timmer;
    expect(lag).toBeLessThanOrEqual(r.total.timmer);
    expect(hog).toBeGreaterThanOrEqual(r.total.timmer);
    expect(r.spann!.rot).toEqual([0.177, 0.309]);
  });
  it('eget val slår medianen', () => {
    const r = berakna(rader, celler, meta, 0.5);
    expect(r.rot).toBe(0.5);
    expect(r.rotStandard).toBe(false);
    expect(r.total.timmer).toBeLessThan(berakna(rader, celler, meta, 0.1).total.timmer);
  });
  it('tomt underlag ger noll utan att krascha', () => {
    const r = berakna(rader, [], {}, null);
    expect(r.total.vol).toBe(0);
    expect(r.saknadeTrad).toBe(117);
    expect(r.spann).toBeNull();
  });
});

describe('tolkaLangd', () => {
  it('läser "diameter antal" per rad, hoppar skräp', () => {
    const t = tolkaLangd('12 116\n14\t137\n16;212\nTotalt\n\n18 1 235 236\n', 'gran');
    expect(t).toEqual([
      { slag: 'gran', cm: 12, antal: 116 }, { slag: 'gran', cm: 14, antal: 137 },
      { slag: 'gran', cm: 16, antal: 212 }, { slag: 'gran', cm: 18, antal: 236 },
    ]);
  });
});

describe('jamforRapport', () => {
  it('räknar rapportens timmer ur m3fub och andel', () => {
    const r = berakna([{ slag: 'gran', cm: 32, antal: 100 }], celler, meta, null);
    const j = jamforRapport(r, { m3fub: 100, timmerPct: 86, massaPct: 14 })!;
    expect(j.rapportTimmer).toBeCloseTo(86, 9);
    expect(j.diffTimmer).toBeCloseTo(r.total.timmer - 86, 9);
    expect(jamforRapport(r, { m3fub: null, timmerPct: 86, massaPct: null })).toBeNull();
  });
});
