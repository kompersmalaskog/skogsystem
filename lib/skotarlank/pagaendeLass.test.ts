import { describe, expect, it } from 'vitest';
import { pagaendeLass, type Stam } from './hogar';
import { ordnaAvlagg } from '@/components/skotarlank/SkotarSida';
import type { Avlagg } from './avlagg';
import type { HogMarkering } from '@/lib/skotarHogarKvar';

const st = (lat: number, sort: string, volym: number): Stam => ({ lat, lng: 15, volym, tradslag: 'Gran', sortiment: sort });
// Två högar 1 km isär: en med timmer + massa, en med bara massa.
const STAMMAR = [st(56.6, 'Gran Timmer: T', 8), st(56.6, 'Gran Massa: A', 4), st(56.61, 'Gran Massa: A', 6)];
const ring = (lat: number): HogMarkering['geometri'] => ({ type: 'Polygon', coordinates: [[[14.999, lat - 0.001], [15.001, lat - 0.001], [15.001, lat + 0.001], [14.999, lat + 0.001], [14.999, lat - 0.001]]] });
const mark = (id: string, lat: number, grupp: HogMarkering['grupp'] = null, typ: HogMarkering['typ'] = 'tagen'): HogMarkering => ({ id, typ, geometri: ring(lat), bredd_m: 8, grupp, skapad_at: `2026-11-06T10:0${id}:00Z` });

describe('volymen till avlägget = det hans markering tog ur högarna', () => {
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
  it('ingen markering = ingenting; en förares Ligger kvar efteråt tar tillbaka', () => {
    expect(pagaendeLass(STAMMAR, [], [], [], [])).toEqual({});
    const t = mark('1', 56.6), k = mark('2', 56.6, null, 'kvar');
    expect(pagaendeLass(STAMMAR, [], [], [t, k], [t, k])).toEqual({});
  });
});

describe('vart körde du det?', () => {
  const av = (ref: string, nr: string): Avlagg => ({ ref, kalla: 'egen', nr, lng: 15, lat: 56, lass: 0, m3: 0, sortiment: [], senaste: [] });
  it('senaste först, sedan i nummerordning, Vidas nummer sist', () => {
    const l = [av('egen:c', '10'), av('vida:01-1', '01-1'), av('egen:a', '2'), av('egen:b', '1')];
    expect(ordnaAvlagg(l, 'egen:a').map((a) => a.nr)).toEqual(['2', '1', '10', '01-1']);
    expect(ordnaAvlagg(l, '').map((a) => a.nr)).toEqual(['1', '2', '10', '01-1']);
  });
});
