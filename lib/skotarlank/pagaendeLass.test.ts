import { describe, expect, it } from 'vitest';
import { pagaendeLass, type Stam } from './hogar';
import { lassForifyllning } from '@/components/skotarlank/SkotarSida';
import type { HogMarkering } from '@/lib/skotarHogarKvar';

const st = (lat: number, sort: string, volym: number): Stam => ({ lat, lng: 15, volym, tradslag: 'Gran', sortiment: sort });
// Två högar 1 km isär: en med timmer + massa, en med bara massa.
const STAMMAR = [st(56.6, 'Gran Timmer: T', 8), st(56.6, 'Gran Massa: A', 4), st(56.61, 'Gran Massa: A', 6)];
const ring = (lat: number): HogMarkering['geometri'] => ({ type: 'Polygon', coordinates: [[[14.999, lat - 0.001], [15.001, lat - 0.001], [15.001, lat + 0.001], [14.999, lat + 0.001], [14.999, lat - 0.001]]] });
const mark = (id: string, lat: number, grupp: HogMarkering['grupp'] = null, typ: HogMarkering['typ'] = 'tagen'): HogMarkering => ({ id, typ, geometri: ring(lat), bredd_m: 8, grupp, skapad_at: `2026-11-06T10:0${id}:00Z` });

describe('det han har på lasset = det hans markeringar tog ur högarna', () => {
  it('hela området: allt i högen', () => {
    const m = mark('1', 56.6);
    expect(pagaendeLass(STAMMAR, [], [], [m], [m])).toEqual({ 'Gran Timmer: T': 8, 'Gran Massa: A': 4 });
  });
  it('bara timmer ibockat: bara timret', () => {
    const m = mark('1', 56.6, 'timmer');
    expect(pagaendeLass(STAMMAR, [], [], [m], [m])).toEqual({ 'Gran Timmer: T': 8 });
  });
  it('två områden summeras per sortiment', () => {
    const a = mark('1', 56.6), b = mark('2', 56.61);
    expect(pagaendeLass(STAMMAR, [], [], [a, b], [a, b])).toEqual({ 'Gran Timmer: T': 8, 'Gran Massa: A': 10 });
  });
  it('det som togs före förra lasset (inte hans nya) räknas inte', () => {
    const gammal = mark('1', 56.6), ny = mark('2', 56.61);
    expect(pagaendeLass(STAMMAR, [], [], [gammal, ny], [ny])).toEqual({ 'Gran Massa: A': 6 });
  });
  it('inget markerat = inget förslag; Ligger kvar efteråt tar tillbaka', () => {
    expect(pagaendeLass(STAMMAR, [], [], [], [])).toEqual({});
    const t = mark('1', 56.6), k = mark('2', 56.6, null, 'kvar');
    expect(pagaendeLass(STAMMAR, [], [], [t, k], [t, k])).toEqual({});
  });
});

describe('lasskortets förifyllning', () => {
  const S = [{ namn: 'A' }, { namn: 'B' }];
  it('det markerade går före förra lasset', () => {
    expect(lassForifyllning(S, { A: 7.4 }, { B: 20 })).toEqual({ varden: { A: 7 }, kalla: 'markerat' });
  });
  it('inget markerat: som förra lasset; inget alls: tomt', () => {
    expect(lassForifyllning(S, {}, { B: 20 })).toEqual({ varden: { B: 20 }, kalla: 'forra' });
    expect(lassForifyllning(S, null, {})).toEqual({ varden: {}, kalla: 'tomt' });
  });
  it('ett sortiment som inte finns på trakten tas inte med', () => {
    expect(lassForifyllning(S, { X: 5 }, {})).toEqual({ varden: {}, kalla: 'tomt' });
  });
});
