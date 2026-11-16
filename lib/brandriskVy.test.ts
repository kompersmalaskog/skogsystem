import { describe, expect, it } from 'vitest';
import { FARG } from '@/lib/design/tokens';
import { arLag, beredskapRubrik, brandSvar, idagForst, nivaFarg, nivaSiffra, visaSamrad, visaUtrustning } from './brandriskVy';

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

describe('beredskapen', () => {
  it('rubriken byter med nivån', () => {
    expect(beredskapRubrik(4)).toBe('Vad gör vi vid stor brandrisk?');
    expect(beredskapRubrik(1)).toBe('Vad gör vi vid mycket liten brandrisk?');
  });
  it('utrustning från måttlig eller vid eldningsförbud, samråd från stor', () => {
    expect([visaUtrustning(2, false), visaUtrustning(3, false), visaUtrustning(1, true)]).toEqual([false, true, true]);
    expect([visaSamrad(3), visaSamrad(4)]).toEqual([false, true]);
  });
  it('idag står först', () => {
    const d = [{ date: '2026-11-15' }, { date: '2026-11-16' }, { date: '2026-11-17' }];
    expect(idagForst(d, '2026-11-16').map((x) => x.date)).toEqual(['2026-11-16', '2026-11-17', '2026-11-15']);
    expect(idagForst(d, '2026-01-01')).toEqual(d);
  });
});
