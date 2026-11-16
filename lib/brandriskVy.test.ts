import { describe, expect, it } from 'vitest';
import { FARG } from '@/lib/design/tokens';
import { arLag, brandSvar, gorSaHar, idagForst, nivaFarg, nivaSiffra, svarRad } from './brandriskVy';

const dag = (f: (h: number) => number) => Array.from({ length: 24 }, (_, h) => f(h));
// 1 på natten, 3 på förmiddag/kväll, 4 kl 14–17
const VANLIG = dag((h) => (h >= 14 && h <= 17 ? 4 : h >= 10 && h <= 20 ? 3 : 1));

describe('nivåernas färg följer appens regler', () => {
  it('1–2 grå, 3 ljus, 4 orange, 5 och 5E röd — aldrig blå, grön, gul eller lila', () => {
    expect([1, 2, 3, 4, 5, 6].map(nivaFarg)).toEqual([FARG.text3, FARG.text3, FARG.text, FARG.orange, FARG.rod, FARG.rod]);
    for (const n of [1, 2, 3, 4, 5, 6]) expect([FARG.bla, FARG.gron, FARG.gul]).not.toContain(nivaFarg(n));
  });
  it('6 heter 5E', () => { expect(nivaSiffra(6)).toBe('5E'); expect(nivaSiffra(4)).toBe('4'); });
  it('låg nivå dämpas', () => { expect([1, 2, 3].map(arLag)).toEqual([true, true, false]); });
});

describe('svaret i ord', () => {
  it('toppen kommer senare och är nära: säger när och att det stiger', () => {
    const s = brandSvar(VANLIG, { idag: true, nuTimme: 11, nuNiva: 3 })!;
    expect(s.rubrik).toBe('Farligast efter lunch – kl 14 till 17');
    expect(s.mening).toBe('Just nu måttlig brandrisk – stiger snart till stor.');
    expect([s.toppNiva, s.toppStart, s.toppSlut]).toEqual([4, 14, 17]);
  });
  it('stor uppgång kvar: "Lugnt nu"', () => {
    expect(brandSvar(VANLIG, { idag: true, nuTimme: 7, nuNiva: 1 })!.mening).toBe('Lugnt nu (mycket liten). Stiger till stor efter lunch.');
  });
  it('mitt i toppen: säger när det lättar', () => {
    const s = brandSvar(VANLIG, { idag: true, nuTimme: 15, nuNiva: 4 })!;
    expect(s.rubrik).toBe('Farligast just nu – till kl 17');
    expect(s.mening).toBe('Stor brandrisk. Lättar efter kl 17.');
  });
  it('toppen är passerad: "Lugnare nu"', () => {
    const s = brandSvar(VANLIG, { idag: true, nuTimme: 19, nuNiva: 3 })!;
    expect(s.rubrik).toBe('Lugnare nu – toppen var efter lunch');
    expect(s.mening).toBe('Måttlig brandrisk just nu, avtagande.');
  });
  it('toppen håller kvällen ut', () => {
    const sen = dag((h) => (h >= 16 ? 5 : 2));
    expect(brandSvar(sen, { idag: true, nuTimme: 18, nuNiva: 5 })!).toMatchObject({ rubrik: 'Farligast just nu', mening: 'Mycket stor brandrisk – håller i sig kvällen ut.' });
  });
  it('en annan dag har inget "just nu"', () => {
    const s = brandSvar(VANLIG, { idag: false, nuTimme: 15, nuNiva: 4 })!;
    expect(s.rubrik).toBe('Farligast efter lunch – kl 14 till 17');
    expect(s.mening).toBe('Väntad topp: stor brandrisk efter lunch.');
    expect(s.rubrik + s.mening).not.toContain('just nu');
  });
  it('två toppar samma dag: den längsta gäller', () => {
    const tva = dag((h) => (h === 9 || (h >= 14 && h <= 16) ? 4 : 2));
    expect(brandSvar(tva, { idag: false, nuTimme: 0, nuNiva: 2 })!).toMatchObject({ toppStart: 14, toppSlut: 16 });
  });
  it('inga timmar: inget svar (aldrig en gissning)', () => {
    expect(brandSvar([], { idag: true, nuTimme: 10, nuNiva: 3 })).toBeNull();
    expect(brandSvar(dag(() => 0), { idag: true, nuTimme: 10, nuNiva: 3 })).toBeNull();
  });
});

describe('första skärmen: en mening och bara det som gäller', () => {
  const s = (nuTimme: number, nuNiva: number, idag = true) => brandSvar(VANLIG, { idag, nuTimme, nuNiva })!.kort;
  it('en kort mening om när — utan dagsdel och utan nivåord', () => {
    expect(s(11, 3)).toBe('Farligast kl 14 till 17.');
    expect(s(15, 4)).toBe('Farligast nu, till kl 17.');
    expect(s(19, 3)).toBe('Lugnare nu. Farligast var kl 14 till 17.');
    expect(s(15, 4, false)).toBe('Farligast kl 14 till 17.');
    expect(brandSvar(dag((h) => (h >= 16 ? 5 : 2)), { idag: true, nuTimme: 18, nuNiva: 5 })!.kort).toBe('Farligast nu, hela kvällen.');
    expect(brandSvar(dag((h) => (h === 15 ? 4 : 3)), { idag: false, nuTimme: 0, nuNiva: 1 })!.kort).toBe('Farligast kl 15.');
  });
  it('liten risk: "Inget särskilt att göra." — ingen tid', () => {
    expect(svarRad(2, brandSvar(dag(() => 2), { idag: true, nuTimme: 10, nuNiva: 2 }))).toBe('Inget särskilt att göra.');
    expect(svarRad(4, brandSvar(VANLIG, { idag: true, nuTimme: 11, nuNiva: 3 }))).toBe('Farligast kl 14 till 17.');
    expect(svarRad(4, null)).toBe('');
  });
  it('Gör så här: utrustning från måttlig eller vid eldningsförbud, samråd från stor, inga band vid 5E; inget vid liten risk', () => {
    expect(gorSaHar(2, false)).toEqual([]);
    expect(gorSaHar(1, true)).toEqual(['Släckare, kratta och spade med']);
    expect(gorSaHar(3, false)).toEqual(['Släckare, kratta och spade med']);
    expect(gorSaHar(4, false)).toEqual(['Släckare, kratta och spade med', 'Prata med uppdragsgivaren först']);
    expect(gorSaHar(6, false)).toEqual(['Släckare, kratta och spade med', 'Prata med uppdragsgivaren först', 'Inga band']);
  });
  it('idag står först', () => {
    const d = [{ date: '2026-11-15' }, { date: '2026-11-16' }, { date: '2026-11-17' }];
    expect(idagForst(d, '2026-11-16').map((x) => x.date)).toEqual(['2026-11-16', '2026-11-17', '2026-11-15']);
    expect(idagForst(d, '2026-01-01')).toEqual(d);
  });
});
