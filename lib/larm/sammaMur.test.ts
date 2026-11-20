import { describe, it, expect } from 'vitest';
import { sammaMur, avstandMellanLinjerM, SAMMA_MUR_M, type MurBit } from './sammaMur';

// Lidhem RP 2025 Bondagård (prod 2026-11-16): planerarens fem stenmursbitar, i markeringarnas egna x/y. Skalan är sidans (zoom 16): 1,313 m per enhet på 56,66° N.
const M_PER_ENHET = 156543.03392 * Math.cos((56.656315934653 * Math.PI) / 180) / 2 ** 16;
const ORIGO = { lat: 56.656315934653, lon: 14.9028512711269 };
const ll = ([x, y]: number[]) => ({ lat: ORIGO.lat - (y * M_PER_ENHET) / 111320, lon: ORIGO.lon + (x * M_PER_ENHET) / (111320 * Math.cos((ORIGO.lat * Math.PI) / 180)) });
const bit = (id: string, xy: number[][], o: Partial<MurBit> = {}): MurBit => ({ id, typ: 'stonewall', hash: 'jq9amy', koordinater: xy.map(ll), ...o });
const A = [[-22.96, 63.71], [-39.46, 67.83], [-63.71, 67.71], [-77.33, 63.83], [-89.83, 45.33]];
const B = [[-3.71, 16.83], [-38.71, 1.96], [-43.96, 18.71]];
const C = [[-2.46, 18.96], [-2.83, 46.58]];
const D = [[-90.46, 46.33], [-104.96, 32.71], [-104.46, 10.08], [-105.58, -5.17]];
const E = [[-67.08, -89.04], [-78.71, -83.54], [-92.83, -94.92], [-103.58, -95.67]];
const lidhem = () => [bit('A', A), bit('B', B), bit('C', C), bit('D', D), bit('E', E)];
const kedja = (m: Map<string, string[]>, id: string) => [...m.get(id)!].sort().join('');

describe('samma mur', () => {
  it('Lidhem: fem bitar är tre murar — A+D, B+C och E för sig', () => {
    const m = sammaMur(lidhem());
    expect(kedja(m, 'A')).toBe('AD'); expect(kedja(m, 'D')).toBe('AD');
    expect(kedja(m, 'B')).toBe('BC'); expect(kedja(m, 'C')).toBe('BC');
    expect(kedja(m, 'E')).toBe('E');
    expect(m.get('A')![0]).toBe('A');   // biten själv först
  });

  it('avstånden är de uppmätta: 1–3 m inom en mur, 35 m mellan två murar', () => {
    const d = (p: number[][], q: number[][]) => avstandMellanLinjerM(p.map(ll), q.map(ll));
    expect(d(A, D)).toBeLessThan(2.5);
    expect(d(B, C)).toBeLessThan(4.5);
    expect(d(A, C)).toBeGreaterThan(30); expect(d(A, C)).toBeLessThan(40);
    expect(d(D, E)).toBeGreaterThan(90);
  });

  it('två murar på samma trakt men långt isär slås ALDRIG ihop (Martin 2026-11-16)', () => {
    const m = sammaMur([bit('A', A), bit('E', E)]);
    expect(m.get('A')).toEqual(['A']); expect(m.get('E')).toEqual(['E']);
  });

  it('kedja: A–B och B–C nära, A–C långt isär → alla tre är samma mur', () => {
    const m = sammaMur([bit('1', [[0, 0], [20, 0]]), bit('2', [[23, 0], [43, 0]]), bit('3', [[46, 0], [66, 0]])]);
    expect(kedja(m, '1')).toBe('123'); expect(kedja(m, '3')).toBe('123');
  });

  it('gränsen: 9 m isär hör ihop, 11 m gör det inte', () => {
    const e = (meter: number) => meter / M_PER_ENHET;
    expect(SAMMA_MUR_M).toBe(10);
    expect(kedja(sammaMur([bit('1', [[0, 0], [20, 0]]), bit('2', [[20 + e(9), 0], [60, 0]])]), '1')).toBe('12');
    expect(kedja(sammaMur([bit('1', [[0, 0], [20, 0]]), bit('2', [[20 + e(11), 0], [60, 0]])]), '1')).toBe('1');
  });

  it('två bitar som korsar varandra mitt på långa segment hör ihop (inga hörn nära varandra)', () => {
    const m = sammaMur([bit('1', [[-100, 0], [100, 0]]), bit('2', [[0, -100], [0, 100]])]);
    expect(kedja(m, '1')).toBe('12');
  });

  it('en bit med egen kommentar (annan hash) är egen information och slås inte ihop', () => {
    const m = sammaMur([bit('A', A), bit('D', D, { hash: 'annan' })]);
    expect(m.get('A')).toEqual(['A']); expect(m.get('D')).toEqual(['D']);
  });

  it('bara stenmur: andra linjer får bara sig själva', () => {
    const m = sammaMur([bit('A', A, { typ: 'ditch' }), bit('D', D, { typ: 'ditch' })]);
    expect(m.get('A')).toEqual(['A']); expect(m.get('D')).toEqual(['D']);
  });
});
