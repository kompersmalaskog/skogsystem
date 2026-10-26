import { describe, expect, it } from 'vitest';
import { traffaAvlagg } from './avlagg';
import {
  andraRad, bekrafta, bytAvlagg, forraLass, foreslagnaRader, kanBekrafta, lassRad, lassTitel,
  lassTotalM3, nastaLassNummer, sattRad, skapaLass, stryk, type LassKontext,
} from './lassModell';
import { sortimentNyckel, sortimentVisning, skordatPerSortiment, valbaraSortiment, VED_MARKAGARE_NYCKEL } from './sortiment';
import type { Avlagg, Lass } from './typer';

const ctx: LassKontext = { objektId: 'o1', voNummer: '111', maskinId: 'A030353', medarbetareId: 'm1' };
const A2: Avlagg = { id: 'vida:2', nummer: '2', kalla: 'vida', lat: 56.6, lng: 15.8 };
const A3: Avlagg = { id: 'vida:3', nummer: '3', kalla: 'vida', lat: 56.601, lng: 15.8 };
const NU = Date.UTC(2026, 9, 19, 8, 0, 0);
const traff = traffaAvlagg({ lat: 56.6, lng: 15.8 }, [A2]);
const R = (nyckel: string, m3: number) => ({ nyckel, namn: nyckel, m3 });

function nyttLass(forra: Lass | null, nr = 1): Lass {
  return skapaLass({ ctx, lassNummer: nr, ts: NU, lat: 56.6, lng: 15.8, traff, forra, sparPunkter: [], vagar: [], nu: NU });
}
const bekraftatMed = (rader: ReturnType<typeof R>[], nr: number): Lass => {
  let l = nyttLass(null, nr);
  l = { ...l, delar: [{ ...l.delar[0], rader }] };
  return bekrafta(l, 'forare', NU);
};

describe('lass', () => {
  it('första lasset på trakten väntar på föraren (bekräftar inte sig självt)', () => {
    const l = nyttLass(null);
    expect(l.status).toBe('vantar_forare');
    expect(l.delar[0].avlaggNummer).toBe('2');
  });
  it('nästa lass fylls i som förra lasset och är ett förslag', () => {
    const forra = bekraftatMed([R('tall', 10), R('kubb', 5)], 1);
    const l = nyttLass(forra, 2);
    expect(l.status).toBe('foreslaget');
    expect(l.delar[0].rader.map((r) => [r.nyckel, r.m3])).toEqual([['tall', 10], ['kubb', 5]]);
    expect(lassTotalM3(l)).toBe(15);
  });
  it('tvetydigt avlägg: inget avlägg valt och föraren måste välja', () => {
    const t = traffaAvlagg({ lat: 56.6, lng: 15.8 }, [A2, { ...A2, id: 'vida:9', nummer: '9', lat: 56.60020 }]);
    expect(t.tvetydigt).toBe(true);
    const forra = bekraftatMed([R('tall', 10)], 1);
    const l = skapaLass({ ctx, lassNummer: 2, ts: NU, lat: 56.6, lng: 15.8, traff: t, forra, sparPunkter: [], vagar: [], nu: NU });
    expect(l.status).toBe('vantar_forare');
    expect(l.delar[0].avlaggId).toBeNull();
    expect(kanBekrafta(l)).toBe(false);
    expect(kanBekrafta(bytAvlagg(l, 1, A3, NU))).toBe(true);
  });
  it('ett tomt lass går inte att bekräfta', () => {
    expect(kanBekrafta(nyttLass(null))).toBe(false);
    expect(bekrafta(nyttLass(null), 'forare', NU).status).toBe('vantar_forare');
  });
  it('+ och − ändrar 1 m³; rad på 0 försvinner; ny rad läggs till', () => {
    let l = nyttLass(bekraftatMed([R('tall', 2)], 1), 2);
    l = andraRad(l, 1, R('tall', 0), -1, NU);
    expect(l.delar[0].rader[0].m3).toBe(1);
    l = andraRad(l, 1, R('tall', 0), -1, NU);
    expect(l.delar[0].rader).toHaveLength(0);
    l = andraRad(l, 1, R('massa', 0), +3, NU);
    expect(l.delar[0].rader).toEqual([R('massa', 3)]);
    expect(sattRad(l, 1, R('massa', 0), 7, NU).delar[0].rader[0].m3).toBe(7);
    expect(andraRad(l, 1, R('massa', 0), -99, NU).delar[0].rader).toHaveLength(0);
  });
  it('nummer = antal lass som räknas (bekräftade + väntande) på maskinen och trakten + 1 — struket tar inget nummer med sig', () => {
    const l1 = bekraftatMed([R('tall', 1)], 1);
    const l2 = stryk(bekraftatMed([R('tall', 1)], 2), NU);
    expect(nastaLassNummer([l1, l2], ctx.maskinId, 'o1')).toBe(2);   // lass 2 struket: nästa heter 2 igen (Bågskyttebanan: "Lass 3" fast ett strukits)
    expect(nastaLassNummer([l1, l2], 'annan', 'o1')).toBe(1);
    expect(nastaLassNummer([l1, l2], ctx.maskinId, 'annan-trakt')).toBe(1);
    const vantande = { ...bekraftatMed([R('tall', 1)], 2), status: 'vantar_forare' as const };
    expect(nastaLassNummer([l1, vantande], ctx.maskinId, 'o1')).toBe(3);   // väntande räknas
  });
  it('numret är ANTALET som räknas + 1 (inte högsta + 1): lass 1 och 4 som räknas ger 3', () => {
    const l1 = bekraftatMed([R('tall', 1)], 1);
    const l4 = bekraftatMed([R('tall', 1)], 4);
    expect(nastaLassNummer([l1, l4], ctx.maskinId, 'o1')).toBe(3);
  });
  it('struket lass mitt i raden: numret hoppar över ett som redan är taget — två lass som räknas heter aldrig lika', () => {
    const l1 = bekraftatMed([R('tall', 1)], 1);
    const l2 = stryk(bekraftatMed([R('tall', 1)], 2), NU);
    const l3 = bekraftatMed([R('tall', 1)], 3);
    expect(nastaLassNummer([l1, l2, l3], ctx.maskinId, 'o1')).toBe(4);   // 2 räknas + 1 = 3, men 3 är taget
  });
  it('förra lasset hoppar över struket och tomt ofyllt', () => {
    const l1 = bekraftatMed([R('tall', 4)], 1);
    const l2 = stryk(bekraftatMed([R('tall', 9)], 2), NU);
    expect(forraLass([l1, l2], ctx.maskinId, 'o1')?.lassNummer).toBe(1);
    expect(foreslagnaRader(null)).toEqual([]);
  });
  it('lasraden: avlägg, sortiment störst först, summa', () => {
    const l = bekraftatMed([R('a', 5), R('b', 10)], 1);
    expect(lassRad(l.delar[0], (n) => n.toUpperCase())).toBe('Avlägg 2 · B: 10 m³ · A: 5 m³ · 15 m³');
  });
});

describe('sortiment', () => {
  it('nyckel: samma namn oavsett mellanslag/versaler; hemved = Ved markägare', () => {
    expect(sortimentNyckel('  Massa:  BmavFall_V3 ')).toBe(sortimentNyckel('massa: bmavfall_v3'));
    expect(sortimentNyckel('Massa: HemvedFall_V3')).toBe(VED_MARKAGARE_NYCKEL);
  });
  it('visningsnamn: skördarens namn läsbart, versionsmärket bort', () => {
    expect(sortimentVisning('Timmer: Vislanda_195_1-2_V3')).toBe('Timmer 195 1-2 · Vislanda');
    expect(sortimentVisning('Massa: BmavFall_V3')).toBe('Massa · BmavFall');
    expect(sortimentVisning('Massa: HemvedFall_V3')).toBe('Ved markägare');
  });
  it('skördat per sortiment grupperar på nyckel, tar bort noll', () => {
    const namn = new Map([['1', 'Timmer: A_V3'], ['2', 'timmer: a_v3'], ['3', 'Kubb: B_V3'], ['4', 'Massa: C_V3']]);
    const s = skordatPerSortiment([
      { sortiment_id: '1', volym_m3sub: 10 }, { sortiment_id: '2', volym_m3sub: '5' }, { sortiment_id: '3', volym_m3sub: 3 }, { sortiment_id: '4', volym_m3sub: 0 },
      { sortiment_id: 'okänt', volym_m3sub: 99 },
    ], namn);
    expect(s.map((x) => [x.nyckel, x.m3])).toEqual([['timmer: a_v3', 15], ['kubb: b_v3', 3]]);
  });
  it('valbara: traktens sortiment + Ved markägare bara när trakten har det', () => {
    const s = [{ nyckel: 'k', namn: 'K', m3: 3 }];
    expect(valbaraSortiment(s, false).map((x) => x.nyckel)).toEqual(['k']);
    expect(valbaraSortiment(s, true).map((x) => x.nyckel)).toEqual(['k', VED_MARKAGARE_NYCKEL]);
  });
});
