import { describe, expect, it } from 'vitest';
import { arRisTrakt, risKvarM3, risLage, risLista, type RisObjekt } from './ris';

const bas: RisObjekt = { grotAnpassad: true, grotHamtad: null, volymSkordare: 1000, sistaAvverkning: '2026-10-01' };
const F = 0.35;

describe('risLage', () => {
  it('inget lass än = kvar med schablon', () => {
    expect(risLage(bas, F)).toEqual({ lage: 'kvar', schablon: 350 });
  });
  it('kopplat risjobb med lass = skotas med riktiga lass', () => {
    expect(risLage({ ...bas, risSkotatM3: 120 }, F)).toEqual({ lage: 'skotas', m3: 120, delas: false });
  });
  it('0 m³ lass räknas som inget lass', () => {
    expect(risLage({ ...bas, risSkotatM3: 0 }, F).lage).toBe('kvar');
  });
  it('grot_hamtad går före allt annat', () => {
    expect(risLage({ ...bas, grotHamtad: '2026-11-21', risSkotatM3: 300 }, F)).toEqual({ lage: 'hamtat', datum: '2026-11-21', m3: 300 });
  });
  it('hämtat via delat risjobb säger ingen volym', () => {
    expect(risLage({ ...bas, grotHamtad: '2026-11-21', risSkotatM3: 500, risDelas: true }, F)).toEqual({ lage: 'hamtat', datum: '2026-11-21', m3: null });
  });
});

describe('risKvarM3', () => {
  it('kvar = schablon', () => expect(risKvarM3(bas, F)).toBe(350));
  it('skotas = schablon minus lass, aldrig under 0', () => {
    expect(risKvarM3({ ...bas, risSkotatM3: 100 }, F)).toBe(250);
    expect(risKvarM3({ ...bas, risSkotatM3: 900 }, F)).toBe(0);
  });
  it('delat risjobb: schablonen står kvar', () => expect(risKvarM3({ ...bas, risSkotatM3: 100, risDelas: true }, F)).toBe(350));
  it('hämtat = 0', () => expect(risKvarM3({ ...bas, grotHamtad: '2026-11-01' }, F)).toBe(0));
});

describe('arRisTrakt', () => {
  it('kräver grot-anpassad, skördad volym och att den inte är ett risjobb', () => {
    expect(arRisTrakt(bas)).toBe(true);
    expect(arRisTrakt({ ...bas, grotAnpassad: false })).toBe(false);
    expect(arRisTrakt({ ...bas, volymSkordare: 0 })).toBe(false);
    expect(arRisTrakt({ ...bas, grotSkotning: true })).toBe(false);
  });
});

describe('risLista', () => {
  it('skotas först, sedan äldst avverkat; hämtat bara senaste 60 dagarna, nyast först', () => {
    const a = { ...bas, id: 'a', sistaAvverkning: '2026-09-01' };
    const b = { ...bas, id: 'b', sistaAvverkning: '2026-01-01' };
    const c = { ...bas, id: 'c', sistaAvverkning: '2026-10-15', risSkotatM3: 50 };
    const d = { ...bas, id: 'd', grotHamtad: '2026-11-10' };
    const e = { ...bas, id: 'e', grotHamtad: '2026-11-20' };
    const gammal = { ...bas, id: 'g', grotHamtad: '2026-08-01' };
    const ej = { ...bas, id: 'x', grotAnpassad: false };
    const { kvar, hamtat } = risLista([a, b, c, d, e, gammal, ej], F, '2026-11-21');
    expect(kvar.map(o => o.id)).toEqual(['c', 'b', 'a']);
    expect(hamtat.map(o => o.id)).toEqual(['e', 'd']);
  });
});
