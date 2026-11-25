import { describe, it, expect } from 'vitest';
import fixtur from './__fixtures__/brokamala_traktdelar_2026-11-25.json';
import { oppnaRing, laggTillHorn, flyttaHorn, taBortHorn, forenklaRing, skjutInSteg, angraSteg, type Punkt } from './ringEdit';

const LAT = 56.3;
const KX = 111320 * Math.cos((LAT * Math.PI) / 180);
const meterTillGrader = (x: number, y: number): Punkt => [14.47 + x / KX, LAT + y / 111000];

// Största avståndet (m) från ett borttaget hörn till den förenklade ringen — formen får inte ändras mer än toleransen.
function maxAvvikelse(orig: Punkt[], ny: Punkt[]): number {
  const m = (p: Punkt): [number, number] => [(p[0] - 14.47) * KX, (p[1] - LAT) * 111000];
  let max = 0;
  for (const p of orig) {
    let min = Infinity;
    for (let i = 0; i < ny.length; i++) {
      const a = m(ny[i]), b = m(ny[(i + 1) % ny.length]), q = m(p);
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2));
      min = Math.min(min, Math.hypot(q[0] - (a[0] + t * dx), q[1] - (a[1] + t * dy)));
    }
    max = Math.max(max, min);
  }
  return max;
}

describe('forenklaRing', () => {
  it('tar bort hörn på en rak kant men behåller hörnen', () => {
    const kvadrat = [[0, 0], [25, 0], [50, 0], [75, 0], [100, 0], [100, 50], [100, 100], [50, 100], [0, 100], [0, 50]].map(([x, y]) => meterTillGrader(x, y));
    const r = forenklaRing(kvadrat, 2, 4);
    expect(r.fore).toBe(10);
    expect(r.efter).toBe(4);
    expect(r.ring).toHaveLength(4);
  });
  it('en tillräckligt stor avvikelse (över toleransen) behålls', () => {
    const f = [[0, 0], [50, 0], [100, 5], [100, 100], [0, 100]].map(([x, y]) => meterTillGrader(x, y));   // hörnet (100,5) avviker 2,5 m från (50,0)–(100,100)? bara ca 2,4 m → tolerans 1 behåller det
    expect(forenklaRing(f, 1, 4).ring).toHaveLength(5);
    expect(forenklaRing(f, 5, 4).ring.length).toBeLessThan(5);
  });
  it('går aldrig under minHorn: de viktigaste hörnen behålls', () => {
    const triangelLik = [[0, 0], [50, 0.5], [100, 0], [100, 100]].map(([x, y]) => meterTillGrader(x, y));
    expect(forenklaRing(triangelLik, 50, 4).ring).toHaveLength(4);
    const manga = Array.from({ length: 20 }, (_, i) => meterTillGrader(10 * Math.cos((i / 20) * 2 * Math.PI), 10 * Math.sin((i / 20) * 2 * Math.PI)));
    expect(forenklaRing(manga, 1000, 4).ring).toHaveLength(4);
  });
  it('en ring som redan har få hörn ändras inte', () => {
    const t = [[0, 0], [10, 0], [0, 10]].map(([x, y]) => meterTillGrader(x, y));
    const r = forenklaRing(t, 2, 4);
    expect(r.ring).toEqual(t);
    expect(r.fore).toBe(3);
  });
  it('slutpunkten (dubblett av första) räknas inte som ett hörn', () => {
    const k = [[0, 0], [100, 0], [100, 100], [0, 100]].map(([x, y]) => meterTillGrader(x, y));
    const r = forenklaRing([...k, k[0]], 2, 4);
    expect(r.fore).toBe(4);
    expect(r.ring).toHaveLength(4);
  });
  describe('Brokamålas riktiga traktdelar (prod 2026-11-25)', () => {
    for (const td of fixtur.traktdelar) {
      it(`traktdel ${td.trdel}: färre hörn, formen inom 2 m`, () => {
        const ring = td.ring as Punkt[];
        const r = forenklaRing(ring, 2, 4);
        expect(r.fore).toBe(oppnaRing(ring).length);
        expect(r.efter).toBeLessThan(r.fore);
        expect(r.efter).toBeGreaterThanOrEqual(4);
        expect(maxAvvikelse(oppnaRing(ring), r.ring)).toBeLessThanOrEqual(2.05);
        // alla kvarvarande hörn finns i originalet (ingen punkt påhittad)
        for (const p of r.ring) expect(oppnaRing(ring).some((o) => o[0] === p[0] && o[1] === p[1])).toBe(true);
      });
    }
    it('rapporterar före och efter för alla tre', () => {
      const rad = fixtur.traktdelar.map((td) => { const r = forenklaRing(td.ring as Punkt[], 2, 4); return `${td.trdel}: ${r.fore} → ${r.efter}`; });
      console.log(rad.join(' · '));
      expect(rad).toHaveLength(3);
    });
  });
});

describe('ångra-stapeln', () => {
  const r0: Punkt[] = [[0, 0], [1, 0], [1, 1]];
  it('ett steg i taget tillbaka, hela vägen', () => {
    const r1 = laggTillHorn(r0, 0, [0.5, 0]);
    const r2 = flyttaHorn(r1, 1, [0.5, 0.2]);
    const r3 = taBortHorn(r2, 2);
    let steg: Punkt[][] = [];
    steg = skjutInSteg(steg, r0);
    steg = skjutInSteg(steg, r1);
    steg = skjutInSteg(steg, r2);
    const a = angraSteg(steg); expect(a.ring).toEqual(r2); steg = a.steg;
    const b = angraSteg(steg); expect(b.ring).toEqual(r1); steg = b.steg;
    const c = angraSteg(steg); expect(c.ring).toEqual(r0); steg = c.steg;
    expect(angraSteg(steg).ring).toBeNull();
    expect(r3.length).toBe(r2.length - 1);
  });
  it('stapeln ändras aldrig på plats och kopierar punkterna', () => {
    const steg: Punkt[][] = [];
    const ny = skjutInSteg(steg, r0);
    expect(steg).toHaveLength(0);
    r0[0][0] = 99;
    expect(ny[0][0][0]).toBe(0);
    r0[0][0] = 0;
  });
});
