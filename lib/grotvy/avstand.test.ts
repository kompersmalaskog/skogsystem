import { describe, it, expect } from 'vitest';
import { K_KANDIDATER, parNyckel, valjKandidater, kandidatPar, narmasteVag, korBegransat, type Punkt } from './avstand';

// Punkter längs en linje i öst–väst (en längdgrad ≈ 61 km på 56,5° N) — avståndsordningen är uppenbar.
const P = (id: string, lng: number, lat = 56.5): Punkt => ({ id, lat, lng });
const A = P('A', 14.0), B = P('B', 14.1), C = P('C', 14.3), D = P('D', 14.8), E = P('E', 15.5);

describe('parNyckel', () => {
  it('samma par ger samma nyckel åt båda håll', () => {
    expect(parNyckel('A', 'B')).toBe(parNyckel('B', 'A'));
    expect(parNyckel('A', 'B')).not.toBe(parNyckel('A', 'C'));
  });
});

describe('valjKandidater', () => {
  it('K närmaste andra punkter, närmast först, aldrig sig själv', () => {
    const k = valjKandidater([A, B, C, D, E], 2);
    expect(k.get('A')).toEqual(['B', 'C']);
    expect(k.get('C')).toEqual(['B', 'A']);
    expect(k.get('E')).toEqual(['D', 'C']);
    k.forEach((lista, id) => expect(lista).not.toContain(id));
  });
  it('färre punkter än K ger färre kandidater', () => {
    expect(valjKandidater([A, B], 3).get('A')).toEqual(['B']);
    expect(valjKandidater([A], 3).get('A')).toEqual([]);
  });
  it('K är 3 som standard', () => {
    expect(K_KANDIDATER).toBe(3);
    expect(valjKandidater([A, B, C, D, E]).get('A')).toHaveLength(3);
  });
  it('lika avstånd ger stabil ordning (id avgör)', () => {
    const x = P('X', 14.0, 56.5), y = P('Y', 14.0, 56.6), z = P('Z', 14.0, 56.4); // y och z lika långt från x
    const a = valjKandidater([x, y, z], 2).get('X');
    const b = valjKandidater([z, y, x], 2).get('X');
    expect(a).toEqual(b);
  });
});

describe('kandidatPar', () => {
  it('unika par i kanonisk riktning (lägst id → högst id)', () => {
    const par = kandidatPar([A, B, C], 2);
    expect(par.map((p) => p.nyckel).sort()).toEqual(['A|B', 'A|C', 'B|C']);
    par.forEach((p) => expect(p.fran.id < p.till.id).toBe(true));
  });
  it('ömsesidigt närmaste ger ETT par, inte två', () => {
    const par = kandidatPar([A, B], 3);
    expect(par).toHaveLength(1);
    expect(par[0].fran.id).toBe('A');
    expect(par[0].till.id).toBe('B');
  });
  it('färre anrop än alla par: 5 punkter, K=2 → högst 10 men normalt färre', () => {
    const par = kandidatPar([A, B, C, D, E], 2);
    expect(par.length).toBeLessThan(10);
    expect(par.length).toBeGreaterThanOrEqual(3);
  });
  it('ordningen är deterministisk', () => {
    const a = kandidatPar([A, B, C, D, E], 2).map((p) => p.nyckel);
    const b = kandidatPar([E, D, C, B, A], 2).map((p) => p.nyckel);
    expect(a).toEqual(b);
  });
});

describe('narmasteVag', () => {
  const kand = new Map<string, string[]>([['A', ['B', 'C', 'D']]]);
  it('minsta KÄNDA vägavstånd bland kandidaterna', () => {
    const km = { [parNyckel('A', 'B')]: 14, [parNyckel('A', 'C')]: 9, [parNyckel('A', 'D')]: 31 };
    expect(narmasteVag('A', kand, km)).toEqual({ km: 9, annanId: 'C' });
  });
  it('okända avstånd (null/saknas) räknas inte — aldrig 0 eller fågelväg', () => {
    const km = { [parNyckel('A', 'B')]: null, [parNyckel('A', 'D')]: 31 };
    expect(narmasteVag('A', kand, km)).toEqual({ km: 31, annanId: 'D' });
  });
  it('inget känt → null (raden visar "–")', () => {
    expect(narmasteVag('A', kand, {})).toBeNull();
    expect(narmasteVag('Z', kand, {})).toBeNull();
  });
  it('0 km är ett giltigt (om än ovanligt) avstånd', () => {
    expect(narmasteVag('A', kand, { [parNyckel('A', 'B')]: 0 })).toEqual({ km: 0, annanId: 'B' });
  });
});

describe('korBegransat', () => {
  it('kör alla jobb och aldrig fler än max samtidigt', async () => {
    let pagar = 0, mest = 0;
    const resultat: number[] = [];
    const jobb = Array.from({ length: 10 }, (_, i) => async () => {
      pagar++; mest = Math.max(mest, pagar);
      await new Promise((r) => setTimeout(r, 5));
      pagar--;
      return i * 2;
    });
    await korBegransat(jobb, 3, (i, v) => { resultat[i] = v; });
    expect(mest).toBeLessThanOrEqual(3);
    expect(resultat).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
  });
  it('tom lista är ok', async () => {
    await expect(korBegransat([], 3)).resolves.toBeUndefined();
  });
});
