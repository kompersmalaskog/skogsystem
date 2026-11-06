import { describe, it, expect } from 'vitest';
import { trakterGrupper } from './trakterLista';
import type { MaskinForslag } from './nasta-v2';
import type { OversiktObjekt } from './oversikt-types';

const o = (id: string, namn: string, status: string) => ({ id, namn, status, typ: 'slutavverkning' }) as unknown as OversiktObjekt;
const bondeskog = o('b', 'Bondeskog AU 2026', 'planerad');            // prod 2026-11-06: status släpar — Giant står där
const brit = o('l', 'Lidhem rp 2025 Britteberg', 'planerad');
const garden = o('g', 'Lidhem RP 2025 Bondagård', 'planerad');
const arv = o('a', 'Arvidstorp RP J-Hus -25', 'planerad');
const edestad = o('e', 'Edestad RP J-Hus -25', 'planerad');
const hons = o('h', 'Hönshylte gallring 2026', 'oplanerad');
const vashult = o('v', 'Vashult', 'avslutat');
const f = (nu: OversiktObjekt | null, ko: OversiktObjekt[]) => ({ nuObjekt: nu, ko: ko.map((x) => ({ objekt: x, troligt: false, kalla: 'ko' })) }) as unknown as MaskinForslag;
const namn: Record<string, string> = { GIANT: 'Giant', EK: 'Elefant 26' };

describe('Trakter — som i Planeringen', () => {
  const g = trakterGrupper([bondeskog, brit, garden, arv, edestad, hons, vashult],
    new Map([['GIANT', f(bondeskog, [brit, garden])], ['EK', f(null, [garden, arv])]]), (m) => namn[m], (x) => (x.id === 'l' ? 'Fossil åker' : null));
  it('pågår = där en maskin står (positionen), även när statusen släpar', () => {
    expect(g.pagar).toEqual([{ id: 'b', namn: 'Bondeskog', under: 'Giant står här', underOrange: false, fynd: null }]);
  });
  it('planerade: vems kö och vilket nummer (samma som planen); ingen kö = "Ingen maskin" orange, sist', () => {
    expect(g.planerade.map((r) => [r.namn, r.under, r.underOrange])).toEqual([
      ['Lidhem Bondagård', 'Elefant 26 · nästa · Giant · som nr 2', false],
      ['Arvidstorp', 'Elefant 26 · som nr 2', false],
      ['Lidhem Britteberg', 'Giant · nästa', false],
      ['Edestad', 'Ingen maskin', true],
    ]);
    expect(g.planerade.find((r) => r.id === 'l')?.fynd).toBe('Fossil åker');
    expect(g.utanMaskin).toBe(1);
  });
  it('oplanerade för sig; avslutade finns inte', () => {
    expect(g.oplanerade.map((r) => r.namn)).toEqual(['Hönshylte gallring']);
    expect(g.antal).toBe(6);
  });
});
