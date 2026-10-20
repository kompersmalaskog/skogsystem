import { describe, expect, it } from 'vitest';
import { traffaAvlagg } from './avlagg';
import {
  andraRad, bekrafta, forslagTillVantande, bytAvlagg, forraLass, foreslagnaRader, kanBekrafta, laggTillDel, lassRad, lassTitel,
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
    expect(bekrafta(nyttLass(null), 'auto', NU).status).toBe('vantar_forare');
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
  it('del 2: eget avlägg, tomma rader, föraren måste fylla i; titeln säger "del 2"', () => {
    const l = bekraftatMed([R('tall', 10)], 1);
    const l2 = laggTillDel(l, { ts: NU + 60_000, lat: 56.601, lng: 15.8, traff: traffaAvlagg({ lat: 56.601, lng: 15.8 }, [A3]), nu: NU });
    expect(l2.delar).toHaveLength(2);
    expect(l2.delar[1].avlaggNummer).toBe('3');
    expect(l2.status).toBe('vantar_forare');
    expect(lassTitel(l2)).toBe('Lass 1 · del 2');
    expect(lassTitel(l)).toBe('Lass 1');
  });
  it('nummer: nästa efter maskinens högsta, struket återanvänds inte', () => {
    const l1 = bekraftatMed([R('tall', 1)], 1);
    const l2 = stryk(bekraftatMed([R('tall', 1)], 2), NU);
    expect(nastaLassNummer([l1, l2], ctx.maskinId, 'o1')).toBe(3);
    expect(nastaLassNummer([l1, l2], 'annan', 'o1')).toBe(1);
  });
  it('förra lasset hoppar över struket och tomt ofyllt', () => {
    const l1 = bekraftatMed([R('tall', 4)], 1);
    const l2 = stryk(bekraftatMed([R('tall', 9)], 2), NU);
    expect(forraLass([l1, l2], ctx.maskinId, 'o1')?.lassNummer).toBe(1);
    expect(foreslagnaRader(null)).toEqual([]);
  });
  it('ett förslag vars lossning aldrig tog slut (appen stängdes) bekräftar inte sig självt utan väntar på föraren; väntande och bekräftade lass rörs inte', () => {
    const forslag = nyttLass(bekraftatMed([R('tall', 4)], 1), 2);
    expect(forslag.status).toBe('foreslaget');
    expect(forslagTillVantande(forslag, NU).status).toBe('vantar_forare');
    const vantar = nyttLass(null);
    expect(forslagTillVantande(vantar, NU)).toBe(vantar);
    const klar = bekraftatMed([R('tall', 4)], 1);
    expect(forslagTillVantande(klar, NU)).toBe(klar);
  });
  it('lasraden: avlägg, sortiment störst först, summa', () => {
    const l = bekraftatMed([R('a', 5), R('b', 10)], 1);
    expect(lassRad(l.delar[0], (n) => n.toUpperCase())).toBe('Avlägg 2 · B 10 · A 5 · 15 m³');
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
