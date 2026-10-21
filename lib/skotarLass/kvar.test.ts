import { describe, expect, it } from 'vitest';
import { beraknaKvar, harSkordat, datumText, farduskotatKontroll, idagText, klarDatum, kvarSammanfattning, perDag, skalningsfaktorer, snittPerDag } from './kvar';
import { lassTotalM3 } from './lassModell';
import type { Lass } from './typer';

const lass = (datum: string, rader: Array<[string, number]>, status: Lass['status'] = 'bekraftat', nr = 1): Lass => ({
  id: `${datum}-${nr}-${Math.random()}`, objektId: 'o', voNummer: null, maskinId: 'M', medarbetareId: null, lassNummer: nr, datum, status,
  bekraftadAv: 'forare', bekraftadTid: null, sparPunkter: [], vagar: [], skapad: '', andrad: '',
  delar: [{ delNr: 1, avlaggId: 'vida:1', avlaggNummer: '1', lossadTid: '', lat: 0, lng: 0, rader: rader.map(([nyckel, m3]) => ({ nyckel, namn: nyckel, m3 })) }],
});
const S = (nyckel: string, m3: number) => ({ nyckel, namn: nyckel, m3 });

describe('kvar', () => {
  it('skördat minus rapporterat per sortiment; struket räknas inte', () => {
    const k = beraknaKvar([S('tall', 100), S('massa', 50)], [lass('2026-10-19', [['tall', 30]]), lass('2026-10-19', [['massa', 99]], 'struket')]);
    expect(k.rader.map((r) => [r.nyckel, r.kvar])).toEqual([['tall', 70], ['massa', 50]]);
    expect(k.kvarTotal).toBe(120);
  });
  it('skotat mer än skördat är "klart" — kvar blir aldrig negativt och drar inte ner totalen', () => {
    const k = beraknaKvar([S('tall', 10), S('massa', 10)], [lass('d', [['tall', 15], ['massa', 4]])]);
    expect(k.rader.find((r) => r.nyckel === 'tall')).toMatchObject({ kvar: 0, klart: true, skotat: 10 });
    expect(k.kvarTotal).toBe(6);
    expect(k.skotat).toBe(14);   // 10 (kapat vid skördat) + 4
  });
  it('sortiment som skördaren inte mätt får ingen rad (det finns inget kvar att ha)', () => {
    expect(beraknaKvar([], [lass('d', [['ved', 3]])]).rader).toEqual([]);
  });
});

describe('klar-dag', () => {
  const d = (datum: string, m3: number) => lass(datum, [['t', m3]]);
  it('visas inte förrän två dagars underlag', () => {
    expect(snittPerDag(perDag([d('2026-10-19', 100)]), '2026-10-19')).toBeNull();
    expect(kvarSammanfattning(beraknaKvar([S('t', 300)], [d('2026-10-19', 100)]), [d('2026-10-19', 100)], '2026-10-19').klarText).toBeNull();
  });
  it('snitt över hela dagar före idag när de räcker', () => {
    const dagar = perDag([d('2026-10-15', 100), d('2026-10-16', 140), d('2026-10-19', 20)]);
    expect(snittPerDag(dagar, '2026-10-19')).toBe(120);
  });
  it('har bara en hel dag + idag: idag tas med', () => {
    expect(snittPerDag(perDag([d('2026-10-16', 100), d('2026-10-19', 140)]), '2026-10-19')).toBe(120);
  });
  it('klar-dag räknas i arbetsdagar, helg hoppas över', () => {
    // fredag 2026-10-23: 250 kvar, 100/dag => 3 dagar => fre, mån, tis
    expect(klarDatum(250, 100, '2026-10-23')).toBe('2026-10-27');
    expect(klarDatum(50, 100, '2026-10-19')).toBe('2026-10-19');
    expect(klarDatum(0, 100, '2026-10-19')).toBeNull();
  });
  it('datumtext', () => {
    expect(datumText('2026-10-19', '2026-10-19')).toBe('idag');
    expect(datumText('2026-10-20', '2026-10-19')).toBe('i morgon');
    expect(datumText('2026-10-21', '2026-10-19')).toBe('onsdag');
    expect(datumText('2026-11-03', '2026-10-19')).toBe('3 nov');
  });
  it('sammanfattning: "Kvar ~121 m³" och "Klar ~onsdag"', () => {
    const ls = [d('2026-10-15', 60), d('2026-10-16', 60)];
    const k = beraknaKvar([S('t', 121 + 120)], ls);
    const s = kvarSammanfattning(k, ls, '2026-10-19');
    expect(s.kvarText).toBe('Kvar ~121 m³');
    expect(s.klarText).toBe('Klar ~onsdag');
  });
  it('idag: bara den egna maskinens lass, antal och m3 (andra skotare på trakten räknas inte)', () => {
    const egen = (datum: string, m3: number) => ({ ...d(datum, m3), maskinId: 'M' });
    const annan = { ...d('2026-10-19', 77), maskinId: 'ANNAN' };
    const r = idagText([egen('2026-10-19', 20), egen('2026-10-19', 11), egen('2026-10-18', 50), annan], '2026-10-19', 'M');
    expect(r).toMatchObject({ antal: 2, m3: 31, text: 'Idag: 2 lass · 31 m³' });
    expect(r.lass).toHaveLength(2);
    // kvar gäller hela trakten
    expect(beraknaKvar([S('t', 200)], [egen('2026-10-19', 20), annan]).skotat).toBe(97);
  });
});

describe('färdigskotad', () => {
  it('under 3 % och 10 m³ kvar → ok', () => {
    expect(farduskotatKontroll(beraknaKvar([S('t', 500)], [lass('d', [['t', 495]])])).ok).toBe(true);
  });
  it('över 10 m³ kvar → fråga med sortimenten', () => {
    const k = farduskotatKontroll(beraknaKvar([S('massa', 300), S('kubb', 200)], [lass('d', [['massa', 282], ['kubb', 193]])]));
    expect(k.ok).toBe(false);
    expect(k.kvarM3).toBe(25);
    expect(k.rader.map((r) => r.nyckel)).toEqual(['massa', 'kubb']);
  });
  it('över 3 % av en liten trakt → fråga', () => {
    expect(farduskotatKontroll(beraknaKvar([S('t', 100)], [lass('d', [['t', 96]])])).ok).toBe(false);
  });
  it('skalning: skotat blir EXAKT skördat per sortiment, upp och ner', () => {
    const skordat = [S('tall', 120), S('massa', 45), S('ved', 12)];
    const ls = [lass('d', [['tall', 50], ['massa', 60]]), lass('d', [['tall', 50], ['massa', 20]], 'bekraftat', 2)];
    const s = skalningsfaktorer(skordat, ls);
    expect(s.faktorer.tall).toBeCloseTo(1.2);
    expect(s.faktorer.massa).toBeCloseTo(45 / 80);
    expect(s.tillagg).toEqual({ ved: 12 });
    // kontroll: summan efter skalning = skördat
    const sum = (n: string) => ls.reduce((t, l) => t + l.delar[0].rader.filter((r) => r.nyckel === n).reduce((x, r) => x + r.m3, 0), 0) * s.faktorer[n];
    expect(sum('tall')).toBeCloseTo(120, 9);
    expect(sum('massa')).toBeCloseTo(45, 9);
    expect(ls.map(lassTotalM3)).toEqual([110, 70]);   // förarens värden orörda
  });
  it('skalning med Opti: Opti före appens start + appens skalade lass = skördat per sortiment (övergången)', () => {
    const skordat = [S('tall', 120), S('massa', 45), S('ved', 12), S('kubb', 30)];
    const ls = [lass('d', [['tall', 50], ['massa', 10]])];
    const opti = { tall: 70, massa: 40, ved: 5, kubb: 999 };   // kubb över skördat → klämt till 30; ved: Opti 5 utan appens lass → tillägg 7
    const s = skalningsfaktorer(skordat, ls, opti);
    expect(s.faktorer.tall).toBeCloseTo(1);          // 120 − 70 = 50 = appens rapporterade
    expect(s.faktorer.massa).toBeCloseTo(0.5);       // 45 − 40 = 5 av 10
    expect(s.tillagg).toEqual({ ved: 7 });
    const sum = (n: string) => ls.reduce((t, l) => t + l.delar[0].rader.filter((r) => r.nyckel === n).reduce((x, r) => x + r.m3, 0), 0) * s.faktorer[n];
    expect(sum('tall') + opti.tall).toBeCloseTo(120, 9);
    expect(sum('massa') + opti.massa).toBeCloseTo(45, 9);
    expect(s.faktorer.kubb).toBeUndefined();         // inget appens lass i kubb
    expect(s.tillagg.kubb).toBeUndefined();          // Opti täcker allt (klämt till skördat) → inget tillägg
  });
  it('skalning med Opti: Opti som täcker hela skördat ger faktor 0, aldrig negativ; negativ Opti räknas som 0', () => {
    expect(skalningsfaktorer([S('x', 10)], [lass('d', [['x', 5]])], { x: 50 }).faktorer.x).toBe(0);
    expect(skalningsfaktorer([S('x', 10)], [lass('d', [['x', 5]])], { x: -4 }).faktorer.x).toBeCloseTo(2);
  });
  it('skördat 0 men rapporterat → faktor 0', () => {
    expect(skalningsfaktorer([], [lass('d', [['x', 5]])]).faktorer.x).toBe(0);
  });
});

describe('harSkordat', () => {
  it('bara när något sortiment har mer än noll m³', () => {
    expect(harSkordat(null)).toBe(false);
    expect(harSkordat(undefined)).toBe(false);
    expect(harSkordat([])).toBe(false);
    expect(harSkordat([S('tall', 0), S('massa', 0)])).toBe(false);
    expect(harSkordat([S('tall', 0), S('massa', 0.4)])).toBe(true);
  });
});
