import { describe, expect, it } from 'vitest';
import { avverkadeRutor, bildHorn, klassFor, klasser, renderaSkog, rimligHojdDm, skak, tillLngLat, tillSweref, trad, utsnittForRingar, RUTA_M, type Rutnat } from './skog';
import { KLASS_FARG } from './stil';

// Ett påhittat rutnät på jämna 10 m nära Skälviken: 20 × 10 rutor, vänster halva hygge, höger halva mogen skog.
const [X0, Y0] = tillSweref(14.6, 56.5).map((v) => Math.round(v / 10) * 10);
function rutnat(f: (k: number, r: number) => number | null, bredd = 20, hojd = 10): Rutnat {
  const hojdDm: (number | null)[] = [];
  for (let r = 0; r < hojd; r++) for (let k = 0; k < bredd; k++) hojdDm.push(f(k, r));
  return { minX: X0, maxY: Y0, bredd, hojd, hojdDm, ar: 2021 };
}
const mitt = (rn: Rutnat, k: number, r: number) => tillLngLat(rn.minX + (k + 0.5) * RUTA_M, rn.maxY - (r + 0.5) * RUTA_M);

describe('ritad karta: klasser ur laserns höjd', () => {
  it('gränserna 1,5 / 7 / 16 m', () => {
    expect(klassFor(null)).toBe('ingen');
    expect(klassFor(14)).toBe('oppet');
    expect(klassFor(15)).toBe('ung');
    expect(klassFor(69)).toBe('ung');
    expect(klassFor(70)).toBe('gallring');
    expect(klassFor(159)).toBe('gallring');
    expect(klassFor(160)).toBe('mogen');
  });
  it('det skördaren fällt är avverkat oavsett lasern', () => {
    const rn = rutnat(() => 250);
    const [lng, lat] = mitt(rn, 3, 4);
    const avv = avverkadeRutor(rn, [{ lng, lat }, { lng: 0, lat: 0 }]);
    expect([...avv]).toEqual([4 * 20 + 3]);
    const kl = klasser(rn, avv);
    expect(kl[4 * 20 + 3]).toBe('avverkat');
    expect(kl[0]).toBe('mogen');
  });
  it('orimlig höjd (banden bytt plats) syns', () => {
    expect(rimligHojdDm(250)).toBe(true);
    expect(rimligHojdDm(null)).toBe(true);
    expect(rimligHojdDm(18000)).toBe(false);
  });
});

describe('ritad karta: utsnitt och hörn', () => {
  it('trakten + 300 m på jämna 10 m; för stort = null', () => {
    const u = utsnittForRingar([[[14.6, 56.5], [14.61, 56.5], [14.61, 56.505]]])!;
    expect(u.minX % 10).toBe(0);
    expect(u.maxY % 10).toBe(0);
    expect(u.bredd * 10).toBeGreaterThan(600 + 600);
    expect(utsnittForRingar([[[14, 56], [15, 56], [15, 57]]])).toBeNull();
    expect(utsnittForRingar([])).toBeNull();
  });
  it('bildens hörn ligger där rutnätet ligger (övre vänster först)', () => {
    const rn = rutnat(() => 0);
    const [ov, oh, nh, nv] = bildHorn(rn);
    expect(ov[1]).toBeGreaterThan(nv[1]);
    expect(oh[0]).toBeGreaterThan(ov[0]);
    expect(tillSweref(...ov).map(Math.round)).toEqual([X0, Y0]);
    expect(tillSweref(...nh).map(Math.round)).toEqual([X0 + 200, Y0 - 100]);
  });
});

describe('ritad karta: träden', () => {
  it('bara där skogen står, aldrig på hygge eller avverkat; storlek efter höjd', () => {
    const rn = rutnat((k) => (k < 10 ? 5 : 280));
    const avv = new Set<number>();
    const t = trad(rn, klasser(rn, avv));
    expect(t.length).toBeGreaterThan(0);
    for (const tr of t) {
      const [x] = tillSweref(tr.lng, tr.lat);
      expect(x).toBeGreaterThanOrEqual(X0 + 100);
      expect(tr.klass).toBe('mogen');
      expect(tr.storlek).toBeCloseTo(0.93, 2);
    }
    // samma indata ger samma träd (kartan dansar inte)
    expect(trad(rn, klasser(rn, avv))).toEqual(t);
  });
  it('inga träd i avverkade rutor', () => {
    const rn = rutnat(() => 280);
    const alla = new Set(rn.hojdDm.map((_, i) => i));
    expect(trad(rn, klasser(rn, alla))).toEqual([]);
  });
  it('skak är fast och i [0,1)', () => {
    expect(skak(17, 2)).toBe(skak(17, 2));
    for (let i = 0; i < 500; i++) { const v = skak(i, 3); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('ritad karta: bilden', () => {
  it('rätt storlek, rätt färg mitt i en klass, genomskinligt utan data', () => {
    const rn = rutnat((k, r) => (r === 0 ? null : k < 10 ? 5 : 280));
    const b = renderaSkog(rn, new Set(), KLASS_FARG, 4);
    expect(b.bredd).toBe(80);
    expect(b.hojd).toBe(40);
    const px = (x: number, y: number) => Array.from(b.data.slice((y * b.bredd + x) * 4, (y * b.bredd + x) * 4 + 4));
    expect(px(10, 30)).toEqual(KLASS_FARG.oppet);
    expect(px(70, 30)).toEqual(KLASS_FARG.mogen);
    expect(px(10, 0)[3]).toBe(0);
  });
  it('kanten mellan hygge och mogen skog: inga påhittade mellanklasser', () => {
    const rn = rutnat((k) => (k < 10 ? 5 : 280));
    const b = renderaSkog(rn, new Set(), KLASS_FARG, 8);
    const farger = new Set<string>();
    for (let y = 0; y < b.hojd; y++) for (let x = 0; x < b.bredd; x++) farger.add(Array.from(b.data.slice((y * b.bredd + x) * 4, (y * b.bredd + x) * 4 + 3)).join(','));
    // Bara hygge, mogen och kantutjämningen mellan dem — aldrig ungskogens eller gallringsskogens färg.
    expect(farger.has(KLASS_FARG.oppet.slice(0, 3).join(','))).toBe(true);
    expect(farger.has(KLASS_FARG.mogen.slice(0, 3).join(','))).toBe(true);
    expect(farger.has(KLASS_FARG.ung.slice(0, 3).join(','))).toBe(false);
    expect(farger.has(KLASS_FARG.gallring.slice(0, 3).join(','))).toBe(false);
  });
  it('en trappa i rutnätet blir en sned kant, inte en trappa', () => {
    // Diagonal gräns: mogen skog där k > r. Utan utjämning byter klassen exakt vid rutkanten; med den ligger bytet olika långt in i varje rad.
    const rn = rutnat((k, r) => (k > r ? 280 : 5), 10, 10);
    const b = renderaSkog(rn, new Set(), KLASS_FARG, 8);
    const forstaMogen = (y: number) => { for (let x = 0; x < b.bredd; x++) if (b.data[(y * b.bredd + x) * 4] === KLASS_FARG.mogen[0]) return x; return -1; };
    const inomRuta = new Set<number>();
    for (let y = 8 * 4; y < 8 * 5; y++) inomRuta.add(forstaMogen(y));
    expect(inomRuta.size).toBeGreaterThan(2);
  });
  it('avverkat ritas i sin egen färg', () => {
    const rn = rutnat(() => 280);
    // Ett block på 3 × 3 rutor (en ensam ruta röstas bort av grannarna — en slutavverkning är aldrig en ensam ruta).
    const block = new Set<number>(); for (let r = 4; r <= 6; r++) for (let k = 4; k <= 6; k++) block.add(r * 20 + k);
    const b = renderaSkog(rn, block, KLASS_FARG, 4);
    const x = 5 * 4 + 2, y = 5 * 4 + 2;
    expect(Array.from(b.data.slice((y * b.bredd + x) * 4, (y * b.bredd + x) * 4 + 4))).toEqual(KLASS_FARG.avverkat);
  });
});
