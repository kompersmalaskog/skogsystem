import { describe, it, expect } from 'vitest';
import { LASS_SAKNAS_FAKTOR, lassMotFlyttar, perViktManad, type ViktRad } from './vikt';
import { PROD_VIKT_RADER } from './vikt.fixtur';
import type { Flytt } from './maskiner';

const NU = new Date('2026-10-20T10:00:00Z');
const rad = (o: Partial<ViktRad> = {}): ViktRad => ({
  man: 8, km_lastad: 100, liter_lastad: 50, km_diesel_lastad: 100, km_tom: 200, liter_tom: 70, km_diesel_tom: 200, km_okand: 0, liter_okand: 0, km_diesel_okand: 0, ...o,
});
const flytt = (id: string, lossad: string, km: number | null): Flytt => ({
  id, nyckel: 'A', maskinNamn: 'Giant', lastad: lossad, lossad, km, min: 60, franId: null, tillId: null, franNamn: null, tillNamn: null,
});

describe('perViktManad: Martins prod-siffror', () => {
  const man = perViktManad(2026, PROD_VIKT_RADER, NU);
  const m = (n: number) => man.find(x => x.m.man === n)!;
  it('månaderna nyast först, juli med', () => {
    expect(man.map(x => x.m.man)).toEqual([10, 9, 8, 7]);
  });
  it('km per klass i hela km och l/mil som Martin räknade: aug 5,28 / 3,66 · sep 5,58 / 3,83 · okt 5,45 / 3,76', () => {
    expect([m(8).lastad.km, m(8).tom.km]).toEqual([538, 845]);
    expect([m(9).lastad.km, m(9).tom.km]).toEqual([601, 755]);
    expect([m(10).lastad.km, m(10).tom.km]).toEqual([295, 535]);
    const tvaDec = (v: number | null) => Math.round((v as number) * 100) / 100;
    expect([m(8).lastad.lPerMil, m(8).tom.lPerMil].map(tvaDec)).toEqual([5.28, 3.66]);
    expect([m(9).lastad.lPerMil, m(9).tom.lPerMil].map(tvaDec)).toEqual([5.58, 3.83]);
    expect([m(10).lastad.lPerMil, m(10).tom.lPerMil].map(tvaDec)).toEqual([5.45, 3.76]);
  });
  it('summan är summan av de avrundade delarna', () => {
    expect(m(8).km).toBe(538 + 845);
    const r = perViktManad(2026, [rad({ km_lastad: 10.4, km_tom: 20.4, km_okand: 5.4 })], NU).find(x => x.m.man === 8)!;
    expect([r.lastad.km, r.tom.km, r.okand.km, r.km]).toEqual([10, 20, 5, 35]);
  });
  it('juli har ingen rad i svaret: "vikt saknas", inga värden — aldrig 0 som ser ut som mätning', () => {
    expect(m(7)).toMatchObject({ harVikt: false, km: 0 });
  });
  it('en månad med bara okänd körning har ingen känd vikt', () => {
    const r = perViktManad(2026, [rad({ km_lastad: 0, km_tom: 0, km_okand: 40 })], NU).find(x => x.m.man === 8)!;
    expect(r.harVikt).toBe(false);
  });
});

describe('l/mil räknas bara över segment med bränsleuppgift', () => {
  it('liter / (km med bränsle / 10) — segment utan bränsle drar inte ner snittet', () => {
    // 100 km totalt, bara 50 km har bränsleuppgift (25 l): 5 l/mil, inte 2,5
    const r = perViktManad(2026, [rad({ km_lastad: 100, liter_lastad: 25, km_diesel_lastad: 50 })], NU).find(x => x.m.man === 8)!;
    expect(r.lastad.lPerMil).toBe(5);
    expect(r.lastad.km).toBe(100);
  });
  it('ingen bränsleuppgift alls: liter och l/mil är null, aldrig 0', () => {
    const r = perViktManad(2026, [rad({ liter_lastad: 0, km_diesel_lastad: 0 })], NU).find(x => x.m.man === 8)!;
    expect(r.lastad.liter).toBeNull();
    expect(r.lastad.lPerMil).toBeNull();
  });
  it('numeric kommer ibland som text', () => {
    const r = perViktManad(2026, [rad({ km_lastad: '538.250' as any, liter_lastad: '284.064' as any, km_diesel_lastad: '538.250' as any })], NU).find(x => x.m.man === 8)!;
    expect(r.lastad.km).toBe(538);
    expect(r.lastad.lPerMil).toBeCloseTo(5.278, 2);
  });
});

describe('lassMotFlyttar: kört med lass mot registrerade flyttar', () => {
  const manader = perViktManad(2026, [rad({ man: 8, km_lastad: 450 })], NU);
  it('mer än 1,5 × flyttarna ger larm; precis 1,5 × gör det inte', () => {
    expect(LASS_SAKNAS_FAKTOR).toBe(1.5);
    const r = (km: number) => lassMotFlyttar(manader, [flytt('a', '2026-08-10T10:00:00Z', km)])[0];
    expect(r(300)).toMatchObject({ lassKm: 450, flyttKm: 300, kanSaknas: false });   // 450 = 1,5 × 300
    expect(r(299).kanSaknas).toBe(true);
    expect(r(301).kanSaknas).toBe(false);
  });
  it('inga flyttar alls i en månad med lass: Y = 0 och larm', () => {
    expect(lassMotFlyttar(manader, [])[0]).toMatchObject({ flyttKm: 0, saknarKm: 0, kanSaknas: true });
  });
  it('varje flytts km avrundas före summering, och en flytt utan km räknas i saknarKm', () => {
    const r = lassMotFlyttar(manader, [flytt('a', '2026-08-10T10:00:00Z', 100.4), flytt('b', '2026-08-11T10:00:00Z', 100.4), flytt('c', '2026-08-12T10:00:00Z', null)])[0];
    expect(r).toMatchObject({ flyttKm: 200, saknarKm: 1 });
  });
  it('flyttar räknas i månaden de lossades, svensk tid (31 aug 23:50 är augusti, 1 sep 00:10 september)', () => {
    const tva = perViktManad(2026, [rad({ man: 8 }), rad({ man: 9 })], NU);
    const r = lassMotFlyttar(tva, [flytt('a', '2026-08-31T21:50:00Z', 40), flytt('b', '2026-08-31T22:10:00Z', 70)]);
    expect(r.find(x => x.m.man === 8)!.flyttKm).toBe(40);
    expect(r.find(x => x.m.man === 9)!.flyttKm).toBe(70);
  });
  it('månaden är den flytten LOSSADES i, inte den lastades i (lastad 31 aug, lossad 1 sep = september)', () => {
    const tva = perViktManad(2026, [rad({ man: 8 }), rad({ man: 9 })], NU);
    const f: Flytt = { ...flytt('a', '2026-08-31T21:50:00Z', 40), lossad: '2026-08-31T22:10:00Z' };
    const r = lassMotFlyttar(tva, [{ ...f, lastad: '2026-08-31T21:00:00Z' }]);
    expect(r.find(x => x.m.man === 8)!.flyttKm).toBe(0);
    expect(r.find(x => x.m.man === 9)!.flyttKm).toBe(40);
  });
  it('månader utan känd vikt (juli) jämförs inte', () => {
    expect(lassMotFlyttar(perViktManad(2026, PROD_VIKT_RADER, NU), []).map(x => x.m.man)).toEqual([10, 9, 8]);
  });
});
