import { describe, expect, it } from 'vitest';
import {
  TRAFF_RADIE_PX,
  avstandTillGeometriPx,
  traffIdFranEgenskaper,
  traffKindFranEgenskaper,
  traffRang,
  valjTraff,
  type Kandidat,
  type Projekt,
} from './egenkontrollTryck';

const k = (id: string, kind: Kandidat['kind'], dPx: number): Kandidat => ({ id, kind, dPx });
// Skarm = koordinaterna sjalva: [x, y] -> { x, y }
const ID: Projekt = ([x, y]) => ({ x, y });

describe('valjTraff - symbol > linje > zon', () => {
  it('en symbol pa en basvag: symbolen, aven om vagen ligger narmare', () => {
    expect(valjTraff([k('vag', 'linje', 2), k('sym', 'symbol', 18)])?.id).toBe('sym');
  });
  it('en basvag inne i en zon: vagen, aven om zonen har avstand 0', () => {
    expect(valjTraff([k('zon', 'zon', 0), k('vag', 'linje', 15)])?.id).toBe('vag');
  });
  it('zonen vinner nar den ar det enda man tryckte pa', () => {
    expect(valjTraff([k('zon', 'zon', 0)])?.id).toBe('zon');
  });
  it('inom samma sort vinner det narmaste', () => {
    expect(valjTraff([k('a', 'symbol', 17), k('b', 'symbol', 6), k('c', 'symbol', 12)])?.id).toBe('b');
  });
  it('utanfor traffytan ar ingen traff - och 22 px exakt ar det', () => {
    expect(valjTraff([k('a', 'symbol', TRAFF_RADIE_PX + 0.1)])).toBeNull();
    expect(valjTraff([k('a', 'symbol', TRAFF_RADIE_PX)])?.id).toBe('a');
  });
  it('traffytan ar minst 44 pt: radien ar 22', () => {
    expect(TRAFF_RADIE_PX * 2).toBeGreaterThanOrEqual(44);
  });
  it('ingenting under fingret: null, inget gissas', () => {
    expect(valjTraff([])).toBeNull();
  });
  it('samma feature i flera tiles slas ihop med kortaste avstandet', () => {
    const r = valjTraff([k('a', 'linje', 20), k('a', 'linje', 4), k('b', 'linje', 9)]);
    expect(r).toEqual({ id: 'a', kind: 'linje', dPx: 4 });
  });
  it('provyta och symbol delar rang - da avgor avstandet, inte ordningen', () => {
    expect(traffRang('provyta')).toBe(traffRang('symbol'));
    expect(valjTraff([k('1', 'provyta', 14), k('sym', 'symbol', 5)])?.id).toBe('sym');
    expect(valjTraff([k('sym', 'symbol', 14), k('1', 'provyta', 5)])?.id).toBe('1');
  });
  it('NaN-avstand ar aldrig en traff', () => {
    expect(valjTraff([k('a', 'symbol', Number.NaN)])).toBeNull();
  });
});

describe('sorten pa en renderad feature', () => {
  it('kontrollpunkternas kind galler', () => {
    expect(traffKindFranEgenskaper({ id: 'x', kind: 'symbol' })).toBe('symbol');
    expect(traffKindFranEgenskaper({ id: 'x', kind: 'linje' })).toBe('linje');
    expect(traffKindFranEgenskaper({ id: 'x', kind: 'zon' })).toBe('zon');
  });
  it('basvagsnumret (egen feature, bara nr) hor till sin vag', () => {
    expect(traffKindFranEgenskaper({ id: 'x', nr: 2 })).toBe('linje');
  });
  it('provytan har nummer', () => {
    expect(traffKindFranEgenskaper({ nummer: 3, matt: 1 })).toBe('provyta');
    expect(traffIdFranEgenskaper({ nummer: 3, matt: 1 })).toBe('3');
  });
  it('en PIL ar kontext och aldrig en kandidat', () => {
    expect(traffKindFranEgenskaper({ kind: 'pil', typ: 'x', rotation: 0 })).toBeNull();
  });
  it('okanda och tomma egenskaper ar ingen kandidat', () => {
    expect(traffKindFranEgenskaper(null)).toBeNull();
    expect(traffKindFranEgenskaper({})).toBeNull();
    expect(traffIdFranEgenskaper({})).toBeNull();
  });
});

describe('avstandTillGeometriPx', () => {
  const tap = { x: 10, y: 10 };
  it('punkt', () => {
    expect(avstandTillGeometriPx({ type: 'Point', coordinates: [13, 14] }, tap, ID)).toBe(5);
  });
  it('linje: narmaste punkt PA segmentet, inte bara brytpunkterna', () => {
    const l = { type: 'LineString', coordinates: [[0, 0], [20, 0]] };
    expect(avstandTillGeometriPx(l, tap, ID)).toBe(10);
  });
  it('linje: forbi andpunkten raknas mot andpunkten', () => {
    const l = { type: 'LineString', coordinates: [[0, 0], [4, 0]] };
    expect(avstandTillGeometriPx(l, { x: 7, y: 4 }, ID)).toBe(5);
  });
  it('zon: inne = 0', () => {
    const z = { type: 'Polygon', coordinates: [[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]] };
    expect(avstandTillGeometriPx(z, tap, ID)).toBe(0);
  });
  it('zon: utanfor = avstandet till kanten', () => {
    const z = { type: 'Polygon', coordinates: [[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]] };
    expect(avstandTillGeometriPx(z, { x: 26, y: 10 }, ID)).toBe(6);
  });
  it('zon: ett hal i ringen raknas som utanfor', () => {
    const z = {
      type: 'Polygon',
      coordinates: [
        [[0, 0], [40, 0], [40, 40], [0, 40], [0, 0]],
        [[10, 10], [30, 10], [30, 30], [10, 30], [10, 10]],
      ],
    };
    // trycket ligger i hallet - alltsa inte "inne" i ytan; narmaste kant ar 5 px bort
    expect(avstandTillGeometriPx(z, { x: 20, y: 15 }, ID)).toBe(5);
  });
  it('okand eller saknad geometri: Infinity, aldrig en traff', () => {
    expect(avstandTillGeometriPx({ type: 'GeometryCollection', coordinates: [] }, tap, ID)).toBe(Infinity);
    expect(avstandTillGeometriPx(null, tap, ID)).toBe(Infinity);
  });
  it('projektionen anvands: samma geometri ger olika pixelavstand vid olika zoom', () => {
    const dubbel: Projekt = ([x, y]) => ({ x: x * 2, y: y * 2 });
    expect(avstandTillGeometriPx({ type: 'Point', coordinates: [13, 14] }, tap, dubbel)).toBeCloseTo(Math.hypot(16, 18), 6);
  });
});
