import { describe, expect, it } from 'vitest';
import { klockslag, skotatTillAvlagg } from './avlaggStat';
import type { Lass } from './typer';

const l = (id: string, status: Lass['status'], delar: Array<{ a: string; t: string; r: Array<[string, number]> }>): Lass => ({
  id, objektId: 'o', voNummer: null, maskinId: 'M', medarbetareId: null, lassNummer: 1, datum: '2026-10-19', status, bekraftadAv: null, bekraftadTid: null,
  sparPunkter: [], vagar: [], skapad: '', andrad: '',
  delar: delar.map((d, i) => ({ delNr: i + 1, avlaggId: d.a, avlaggNummer: d.a, lossadTid: d.t, lat: 0, lng: 0, rader: d.r.map(([nyckel, m3]) => ({ nyckel, namn: nyckel, m3 })) })),
});

describe('skotat till avlägg', () => {
  const ls = [
    l('1', 'bekraftat', [{ a: 'vida:2', t: '2026-10-19T10:00:00Z', r: [['tall', 10], ['massa', 5]] }]),
    l('2', 'bekraftat', [{ a: 'vida:2', t: '2026-10-19T12:12:00Z', r: [['tall', 8]] }, { a: 'vida:3', t: '2026-10-19T12:20:00Z', r: [['massa', 7]] }]),
    l('3', 'struket', [{ a: 'vida:2', t: '2026-10-19T13:00:00Z', r: [['tall', 99]] }]),
  ];
  it('summerar delarna som hör till avlägget, räknar lass, tar senaste tid; struket räknas inte', () => {
    const s = skotatTillAvlagg(ls, 'vida:2');
    expect(s).toMatchObject({ m3: 23, antalLass: 2, senast: '2026-10-19T12:12:00Z' });
    expect(s.perSortiment.map((x) => [x.nyckel, x.m3])).toEqual([['tall', 18], ['massa', 5]]);
  });
  it('del 2 hör till sitt avlägg', () => {
    expect(skotatTillAvlagg(ls, 'vida:3')).toMatchObject({ m3: 7, antalLass: 1 });
  });
  it('inget skotat hit', () => {
    expect(skotatTillAvlagg(ls, 'vida:9')).toMatchObject({ m3: 0, antalLass: 0, senast: null });
  });
  it('efter avslut följer volymerna skalningen', () => {
    expect(skotatTillAvlagg(ls, 'vida:2', { tall: 2 }).perSortiment[0]).toMatchObject({ nyckel: 'tall', m3: 36 });
  });
  it('klockslag i svensk tid', () => {
    expect(klockslag('2026-10-19T12:12:00Z')).toBe('14:12');
  });
});
