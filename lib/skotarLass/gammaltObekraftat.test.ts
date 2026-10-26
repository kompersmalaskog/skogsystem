// De gamla självbekräftade lassen (bekraftad_av 'auto', före 2026-10-21): räknas inte som skotat någonstans, granskas av en planerare, raderas aldrig.
import { describe, expect, it } from 'vitest';
import { appStartPerMaskin, raknadeOptiLass, type OptiLass } from './opti';
import { beraknaKvar, perDag, skotatMerAnSkordat, SKOTAT_OVER_M3 } from './kvar';
import { skotatTillAvlagg } from './avlaggStat';
import { arObekraftatGammalt, bekrafta, raknasSomSkotat } from './lassModell';
import { granskArgument, granskKonsekvens, granskRad, kanSlaIhop, obekraftadeGrupper, standardMottagare } from './granskning';
import { lassFranServer } from './server';
import type { Lass } from './typer';

const L = (id: string, nr: number, m3: number, over: Partial<Lass> = {}): Lass => ({
  id, objektId: 'o', voNummer: '555', maskinId: 'E1', medarbetareId: null, lassNummer: nr, datum: '2026-10-20', status: 'bekraftat', bekraftadAv: 'auto',
  bekraftadTid: null, sparPunkter: [], vagar: [], skapad: '', andrad: '',
  delar: [{ delNr: 1, avlaggId: 'vida:1', avlaggNummer: '01-1', lossadTid: `2026-10-20T10:${String(nr).padStart(2, '0')}:00Z`, lat: 0, lng: 0, rader: [{ nyckel: 'timmer', namn: 'Timmer: Vislanda_V3', m3 }] }],
  ...over,
});
const S = (nyckel: string, m3: number) => ({ nyckel, namn: nyckel, m3, kundkoder: [] as string[] });
const opti = (datum: string, iso: string, m3: number, maskinId = 'E1'): OptiLass => ({ maskinId, datum, lassNummer: 1, tidMs: Date.parse(iso), volymM3: m3, rader: [{ namn: 'Timmer', kundkod: null, m3 }] });

describe('vad som räknas som skotat', () => {
  it('bara Klar räknas: struket, automatiskt skapat och obesvarat (väntar på föraren) räknas aldrig; förare och planerare räknas', () => {
    expect(raknasSomSkotat(L('a', 1, 20))).toBe(false);                                           // auto
    expect(raknasSomSkotat(L('b', 1, 20, { bekraftadAv: 'forare' }))).toBe(true);
    expect(raknasSomSkotat(L('c', 1, 20, { bekraftadAv: 'planerare' }))).toBe(true);              // granskat av en planerare
    expect(raknasSomSkotat(L('d', 1, 20, { bekraftadAv: null, status: 'vantar_forare' }))).toBe(false);   // obesvarat: föraren har inte tryckt Klar
    expect(raknasSomSkotat(L('d2', 1, 20, { bekraftadAv: null, status: 'foreslaget' }))).toBe(false);
    expect(raknasSomSkotat(L('e', 1, 20, { bekraftadAv: 'forare', status: 'struket' }))).toBe(false);
    expect(raknasSomSkotat(L('f', 1, 20, { status: 'struket' }))).toBe(false);
  });
  it('"obekräftat gammalt" är auto som inte är struket', () => {
    expect(arObekraftatGammalt(L('a', 1, 20))).toBe(true);
    expect(arObekraftatGammalt(L('a', 1, 20, { status: 'struket' }))).toBe(false);
    expect(arObekraftatGammalt(L('a', 1, 20, { bekraftadAv: 'planerare' }))).toBe(false);
  });
  it('kvar: 19 gamla lass à 20 m³ drar inte ner kvar — bara det föraren bekräftat', () => {
    const gamla = Array.from({ length: 19 }, (_, i) => L(`g${i}`, i + 1, 20));
    const forare = L('f1', 20, 15, { bekraftadAv: 'forare', datum: '2026-10-21' });
    const k = beraknaKvar([S('timmer', 400)], [...gamla, forare]);
    expect(k.rader[0]).toMatchObject({ skotatApp: 15, kvar: 385 });
  });
  it('en planerare som bekräftat ett gammalt lass får det att räknas', () => {
    expect(beraknaKvar([S('timmer', 400)], [L('p', 1, 20, { bekraftadAv: 'planerare' })]).rader[0]).toMatchObject({ skotatApp: 20, kvar: 380 });
  });
  it('övergången Opti → appen utgår från första lass som RÄKNAS: bara gamla lass = Opti räknas hela vägen', () => {
    const gamla = [L('g1', 1, 20), L('g2', 2, 20)];
    expect(appStartPerMaskin(gamla).size).toBe(0);
    const ol = [opti('2026-10-20', '2026-10-20T09:00:00Z', 40)];
    expect(raknadeOptiLass(ol, appStartPerMaskin(gamla))).toHaveLength(1);
    // föraren börjar bekräfta i morgon: Opti före det räknas, Opti efter räknas inte
    const med = [...gamla, L('f', 3, 15, { bekraftadAv: 'forare', delar: [{ ...L('x', 1, 1).delar[0], lossadTid: '2026-10-21T08:00:00Z' }] })];
    const ol2 = [opti('2026-10-20', '2026-10-20T09:00:00Z', 40), opti('2026-10-21', '2026-10-21T09:00:00Z', 30)];
    expect(raknadeOptiLass(ol2, appStartPerMaskin(med)).map((o) => o.datum)).toEqual(['2026-10-20']);
  });
  it('klar-dag: gamla lass ger ingen takt', () => {
    expect(perDag([L('g', 1, 20), L('f', 2, 10, { bekraftadAv: 'forare', datum: '2026-10-21' })])).toEqual([{ datum: '2026-10-21', m3: 10 }]);
  });
  it('skotat hit på avläggskortet räknar inte gamla lass', () => {
    expect(skotatTillAvlagg([L('g', 1, 20), L('f', 2, 10, { bekraftadAv: 'forare' })], 'vida:1')).toMatchObject({ m3: 10, antalLass: 1 });
  });
  it('appen kan inte längre bekräfta som auto — varken i typen eller vid körning', () => {
    const tomt = L('v', 1, 20, { status: 'vantar_forare', bekraftadAv: null });
    expect(bekrafta(tomt, 'forare', 1).bekraftadAv).toBe('forare');
    // @ts-expect-error 'auto' får inte skrivas längre
    expect(bekrafta(tomt, 'auto', 1)).toBe(tomt);
  });
  it('databasens värden läses: auto och planerare behålls, okänt blir null', () => {
    const rad = (v: unknown) => lassFranServer({ id: 'x', objekt_id: 'o', maskin_id: 'M', lass_nummer: 1, datum: '2026-10-20', status: 'bekraftat', bekraftad_av: v, skapad: '2026-10-20T10:00:00Z', andrad: '2026-10-20T10:00:00Z', skotar_lass_del: [] })!;
    expect(rad('auto').bekraftadAv).toBe('auto');
    expect(rad('planerare').bekraftadAv).toBe('planerare');
    expect(rad('forare').bekraftadAv).toBe('forare');
    expect(rad('nagot').bekraftadAv).toBeNull();
  });
});

describe('skotat mer än skördat (info till planeraren)', () => {
  it('inget skördat → ingen varning; knappt över → ingen varning', () => {
    expect(skotatMerAnSkordat([], [L('f', 1, 50, { bekraftadAv: 'forare' })])).toBeNull();
    expect(skotatMerAnSkordat([S('timmer', 100)], [L('f', 1, 105, { bekraftadAv: 'forare' })])).toBeNull();           // 5 m³ / 5 %: under 10 m³
    expect(skotatMerAnSkordat([S('timmer', 1000)], [L('f', 1, 1020, { bekraftadAv: 'forare' })])).toBeNull();         // 20 m³ men 2 %
  });
  it('över både 3 % och 10 m³ → varning med siffrorna, oavsett sortiment (kvar kapar per sortiment och visar aldrig detta)', () => {
    const v = skotatMerAnSkordat([S('timmer', 200)], [L('f', 1, 230, { bekraftadAv: 'forare' })]);
    expect(v).toEqual({ skordat: 200, skotat: 230, over: 30 });
    expect(SKOTAT_OVER_M3).toBe(10);
    // tall 100 skördat, 130 skotat; massa 100 skördat, 0 skotat → totalt 130 av 200: ingen varning (summan, inte ett sortiment)
    expect(skotatMerAnSkordat([S('tall', 100), S('massa', 100)], [L('f', 1, 130, { bekraftadAv: 'forare', delar: [{ ...L('x', 1, 1).delar[0], rader: [{ nyckel: 'tall', namn: 'tall', m3: 130 }] }] })])).toBeNull();
  });
  it('gamla obekräftade lass ger ingen varning, Opti före appens start räknas med', () => {
    const gamla = Array.from({ length: 19 }, (_, i) => L(`g${i}`, i + 1, 20));
    expect(skotatMerAnSkordat([S('timmer', 100)], gamla)).toBeNull();
    expect(skotatMerAnSkordat([S('timmer', 100)], gamla, [opti('2026-10-20', '2026-10-20T09:00:00Z', 140)])).toEqual({ skordat: 100, skotat: 140, over: 40 });
  });
  it('Opti utan sortimentsrader räknas med lassets egen volym', () => {
    const o: OptiLass = { maskinId: 'E1', datum: '2026-10-20', lassNummer: 1, tidMs: null, volymM3: 150, rader: [] };
    expect(skotatMerAnSkordat([S('timmer', 100)], [], [o])?.over).toBe(50);
  });
});

describe('granskningen', () => {
  const g1 = L('a1', 3, 20); const g2 = L('a2', 1, 20); const g3 = L('a3', 2, 20, { maskinId: 'E2' });
  const g4 = L('a4', 1, 20, { datum: '2026-10-19' });
  it('grupperar de gamla per trakt, maskin och dag — nyaste dag först, lassen i nummerordning; allt annat är borta', () => {
    const grupper = obekraftadeGrupper([g1, g2, g3, g4, L('s', 9, 20, { status: 'struket' }), L('f', 8, 20, { bekraftadAv: 'forare' }), L('p', 7, 20, { bekraftadAv: 'planerare' })]);
    expect(grupper.map((g) => [g.maskinId, g.datum, g.lass.map((l) => l.lassNummer), g.m3])).toEqual([
      ['E1', '2026-10-20', [1, 3], 40], ['E2', '2026-10-20', [2], 20], ['E1', '2026-10-19', [1], 20],
    ]);
  });
  it('inga gamla lass → inga grupper', () => {
    expect(obekraftadeGrupper([L('f', 1, 20, { bekraftadAv: 'forare' })])).toEqual([]);
  });
  it('konsekvenstexten säger vad som händer', () => {
    expect(granskKonsekvens('bekrafta', [g1, g2])).toBe('2 lass · 40 m³ räknas som skotat. Lassen ändras inte.');
    expect(granskKonsekvens('stryk', [g1])).toBe('1 lass · 20 m³ räknas inte som skotat. Lassen finns kvar i databasen som strukna.');
    expect(granskKonsekvens('slaihop', [g1, g2], g2)).toBe('Lass 1 får 40 m³ (alla valdas volym läggs ihop) och räknas som skotat. Lass 3 stryks.');
    expect(granskKonsekvens('slaihop', [g1, g2], null)).toBe('Välj vilket lass de andra ska slås ihop i.');
  });
  it('slå ihop kräver två lass och en mottagare bland dem; förvald mottagare är lägsta numret', () => {
    expect(kanSlaIhop([g1], 'a1')).toBe(false);
    expect(kanSlaIhop([g1, g2], null)).toBe(false);
    expect(kanSlaIhop([g1, g2], 'x')).toBe(false);
    expect(kanSlaIhop([g1, g2], 'a2')).toBe(true);
    expect(standardMottagare([g1, g2])?.id).toBe('a2');
    expect(standardMottagare([])).toBeNull();
  });
  it('argumenten till databasfunktionen: mål bara vid ihopslagning, tom anledning skickas inte', () => {
    expect(granskArgument('bekrafta', [g1, g2], 'a2', '  ')).toEqual({ p_beslut: 'bekrafta', p_lass: ['a1', 'a2'], p_mal: null, p_anledning: null });
    expect(granskArgument('slaihop', [g1, g2], 'a2', ' Samma lossning ')).toEqual({ p_beslut: 'slaihop', p_lass: ['a1', 'a2'], p_mal: 'a2', p_anledning: 'Samma lossning' });
  });
  it('raden för ett lass: nummer, tid, avlägg, sortiment och m³', () => {
    expect(granskRad(g1, () => '14:02')).toBe('Lass 3 · 14:02 · Avlägg 01-1 · Vislanda_V3 20 · 20 m³');
  });
});
