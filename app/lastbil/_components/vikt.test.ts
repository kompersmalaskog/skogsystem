import { describe, it, expect } from 'vitest';
import { LASS_SAKNAS_FAKTOR, dieselAr, lassMotFlyttar, matarAr, matarKm, perViktManad, type ViktRad } from './vikt';
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
  it('km per klass i hela km och l/mil som Martins första körning: aug 5,10 / 3,66 · sep 5,47 / 3,83 · okt 5,30 / 3,76', () => {
    expect([m(8).lastad.km, m(8).tom.km]).toEqual([482, 845]);
    expect([m(9).lastad.km, m(9).tom.km]).toEqual([504, 755]);
    expect([m(10).lastad.km, m(10).tom.km]).toEqual([242, 535]);
    const tvaDec = (v: number | null) => Math.round((v as number) * 100) / 100;
    expect([m(8).lastad.lPerMil, m(8).tom.lPerMil].map(tvaDec)).toEqual([5.1, 3.66]);
    expect([m(9).lastad.lPerMil, m(9).tom.lPerMil].map(tvaDec)).toEqual([5.47, 3.83]);
    expect([m(10).lastad.lPerMil, m(10).tom.lPerMil].map(tvaDec)).toEqual([5.3, 3.76]);
  });
  it('summan är summan av de avrundade delarna', () => {
    expect(m(8).km).toBe(482 + 845 + 114);
    expect([m(9).km, m(10).km]).toEqual([504 + 755 + 97, 242 + 535 + 53]);
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

describe('mätarens km: lastad + tom + okänd, och månader mätaren inte täcker', () => {
  const man = perViktManad(2026, PROD_VIKT_RADER, NU);
  it('månadens km är mätarens: aug 1 441 · sep 1 356 · okt 830 (inklusive okänd)', () => {
    expect(man.map(v => [v.m.man, matarKm(v)])).toEqual([[10, 830], [9, 1356], [8, 1441], [7, null]]);
  });
  it('juli har ingen mätare: null, inte 0', () => {
    expect(matarKm(man.find(v => v.m.man === 7)!)).toBeNull();
  });
  it('året = summan av månaderna som listan visar (3 627), och juli nämns som saknad när det fanns rundor', () => {
    const ar = matarAr(man, () => true);
    expect(ar.km).toBe(1441 + 1356 + 830);
    expect(ar.saknas.map(m => m.man)).toEqual([7]);
    expect(matarAr(man, m => m.man !== 7).saknas).toEqual([]);          // en månad utan körning är inte "saknad"
  });
  it('en månad med bara okänd körning täcks inte av mätaren (delsumma vore ett falskt tal)', () => {
    const bara = perViktManad(2026, [rad({ km_lastad: 0, km_tom: 0, km_okand: 9 })], NU).find(v => v.m.man === 8)!;
    expect(matarKm(bara)).toBeNull();
  });
});

describe('dieselns summa: lastad + tom + okänd delat med km med bränsle (en rad ska gå att räkna ihop)', () => {
  const man = perViktManad(2026, PROD_VIKT_RADER, NU);
  const m = (n: number) => man.find(x => x.m.man === n)!;
  it('månadens liter och l/mil över alla klasser: aug 555 l, 4,2 l/mil · sep 565 l, 4,5 · okt 329 l, 4,2', () => {
    expect([8, 9, 10].map(n => m(n).diesel.liter)).toEqual([555, 565, 329]);
    expect([8, 9, 10].map(n => Math.round((m(n).diesel.lPerMil as number) * 10) / 10)).toEqual([4.2, 4.5, 4.2]);
  });
  it('okänd körning med bränsle ingår i litrarna och i nämnaren', () => {
    const r = perViktManad(2026, [rad({ km_lastad: 100, liter_lastad: 50, km_diesel_lastad: 100, km_tom: 100, liter_tom: 30, km_diesel_tom: 100, km_okand: 50, liter_okand: 20, km_diesel_okand: 50 })], NU).find(x => x.m.man === 8)!;
    expect(r.diesel.liter).toBe(100);
    expect(r.diesel.lPerMil).toBeCloseTo(100 / 25, 6);                  // 100 l över 250 km = 4 l/mil
  });
  it('saknas diesel för en del räknas bara km med diesel i nämnaren — litrarna är oförändrade', () => {
    const r = perViktManad(2026, [rad({ km_lastad: 100, liter_lastad: 50, km_diesel_lastad: 100, km_tom: 300, liter_tom: 0, km_diesel_tom: 0 })], NU).find(x => x.m.man === 8)!;
    expect(r.diesel.liter).toBe(50);
    expect(r.diesel.lPerMil).toBe(5);                                    // 50 l över de 100 km som har diesel, inte över 400
  });
  it('ingen diesel alls: liter och l/mil är null, aldrig 0', () => {
    const r = perViktManad(2026, [rad({ liter_lastad: 0, km_diesel_lastad: 0, liter_tom: 0, km_diesel_tom: 0 })], NU).find(x => x.m.man === 8)!;
    expect(r.diesel).toMatchObject({ liter: null, lPerMil: null });
    expect(dieselAr([r]).liter).toBeNull();
  });
  it('året: liter = summan av månadernas visade liter (1 449), l/mil över alla km med bränsle, juli utan mätare räknas inte', () => {
    const ar = dieselAr(man);
    expect(ar.liter).toBe(555 + 565 + 329);
    expect(ar.lPerMil).toBeCloseTo((555.09 + 564.853 + 329.42) / ((482 + 845 + 504 + 755 + 242 + 535) / 10), 2);
    // en månad med bara okänd körning täcks inte av mätaren och bidrar inte med liter
    const bara = perViktManad(2026, [rad({ km_lastad: 0, km_tom: 0, km_okand: 9, liter_okand: 5, km_diesel_okand: 9 })], NU);
    expect(dieselAr(bara).liter).toBeNull();
  });
  it('året summerar månadernas AVRUNDADE liter (10,4 + 10,4 = 10 + 10, inte 21) — som månadslistan', () => {
    const tva = perViktManad(2026, [rad({ man: 8, liter_lastad: 10.4, liter_tom: 0, km_diesel_tom: 0 }), rad({ man: 9, liter_lastad: 10.4, liter_tom: 0, km_diesel_tom: 0 })], NU);
    expect(dieselAr(tva).liter).toBe(20);
  });
});
