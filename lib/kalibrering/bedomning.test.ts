import { describe, it, expect } from 'vitest';
import {
  avvikelseStatus, avvikelseTon, bedomProfil, tolFranProfil, trCellBedom, atgRad, atgardDom,
  objektBedom, objektDom, objektSaknarNamn,
} from './bedomning';
import type { AtgardEffekt, KravRow, MaskinInfo, ObjektStat, VariabelStat } from './typer';

const VIDA: KravRow[] = [
  { variabel: 'diameter', metrik: 'traffprocent', riktning: 'hog_bra', tolerans: 4, mal: 85, golv: 75, enhet: '%', larm_min_matt: 150 },
  { variabel: 'diameter', metrik: 'systematisk', riktning: 'lag_bra', tolerans: null, mal: 1.0, golv: 1.5, enhet: 'mm', larm_min_matt: null },
  { variabel: 'diameter', metrik: 'standardavv', riktning: 'lag_bra', tolerans: null, mal: 3.5, golv: 4.5, enhet: 'mm', larm_min_matt: null },
  { variabel: 'langd', metrik: 'traffprocent', riktning: 'hog_bra', tolerans: 2, mal: 100, golv: 95, enhet: '%', larm_min_matt: 40 },
];
const BIO: KravRow[] = [
  { variabel: 'diameter', metrik: 'traffprocent', riktning: 'hog_bra', tolerans: 4, mal: 55, golv: 55, enhet: '%', larm_min_matt: 150 },
  { variabel: 'diameter', metrik: 'grov_avvikelse', riktning: 'lag_bra', tolerans: 20, mal: 5, golv: 5, enhet: '%', larm_min_matt: null },
];
const stat = (o: Partial<VariabelStat>): VariabelStat => ({ n: 500, traffPct: 90, systematisk: 0, standardavv: 3, grovPct: null, tolerans: 4, grovTolerans: null, ...o });

describe('avvikelseStatus / avvikelseTon — trösklarna är Trends', () => {
  it('diameter: ±4 ok, >4 orange, >6 röd, <−4 för litet', () => {
    expect(avvikelseStatus({ värde: 4, enhet: 'dia' })).toBe('ok');
    expect(avvikelseStatus({ värde: 4.01, enhet: 'dia' })).toBe('orange');
    expect(avvikelseStatus({ värde: 6, enhet: 'dia' })).toBe('orange');
    expect(avvikelseStatus({ värde: 6.01, enhet: 'dia' })).toBe('röd');
    expect(avvikelseStatus({ värde: -4, enhet: 'dia' })).toBe('ok');
    expect(avvikelseStatus({ värde: -4.01, enhet: 'dia' })).toBe('förLitet');
  });
  it('längd: >2 orange, >3 röd, <−2 för litet', () => {
    expect(avvikelseStatus({ värde: 2, enhet: 'len' })).toBe('ok');
    expect(avvikelseStatus({ värde: 2.5, enhet: 'len' })).toBe('orange');
    expect(avvikelseStatus({ värde: 3.5, enhet: 'len' })).toBe('röd');
    expect(avvikelseStatus({ värde: -2.5, enhet: 'len' })).toBe('förLitet');
  });
  it('under 10 kontroller dämpas ett aggregat till ok, en enskild kontroll (utan antal) dämpas aldrig', () => {
    expect(avvikelseStatus({ värde: 9, enhet: 'dia', antalKontroller: 9 })).toBe('ok');
    expect(avvikelseStatus({ värde: 9, enhet: 'dia', antalKontroller: 10 })).toBe('röd');
    expect(avvikelseStatus({ värde: 9, enhet: 'dia' })).toBe('röd');
  });
  it('status → ton: ok / cold / hi / hot', () => {
    expect(avvikelseTon(0, 'dia')).toBe('ok');
    expect(avvikelseTon(-5, 'dia')).toBe('cold');
    expect(avvikelseTon(5, 'dia')).toBe('hi');
    expect(avvikelseTon(7, 'dia')).toBe('hot');
  });
});

describe('bedomProfil — sämsta metriken styr, OK är tyst', () => {
  it('Giants verkliga VIDA-tal (77 % / +0,81 / 4,07): orange — under målet, över golvet', () => {
    const b = bedomProfil(stat({ n: 1113, traffPct: 77, systematisk: 0.81, standardavv: 4.07 }), 'diameter', VIDA);
    expect(b.status).toBe('orange');
    expect(b.larmTyst).toBe(false);
    expect(b.detaljer).toEqual([
      { metrik: 'traffprocent', status: 'orange' },
      { metrik: 'systematisk', status: 'ok' },
      { metrik: 'standardavv', status: 'orange' },
    ]);
  });
  it('Giants längd 93,68 % mot golvet 95 → röd', () => {
    expect(bedomProfil(stat({ n: 285, traffPct: 93.68 }), 'langd', VIDA).status).toBe('röd');
  });
  it('under larm_min_matt: tyst (grå), inga detaljer', () => {
    const b = bedomProfil(stat({ n: 149, traffPct: 10 }), 'diameter', VIDA);
    expect(b).toEqual({ status: 'ok', larmTyst: true, detaljer: [] });
  });
  it('ingen statistik eller inga kravrader → tyst', () => {
    expect(bedomProfil(null, 'diameter', VIDA).larmTyst).toBe(true);
    expect(bedomProfil(stat({ n: 0 }), 'diameter', VIDA).larmTyst).toBe(true);
    expect(bedomProfil(stat({}), 'diameter', []).larmTyst).toBe(true);
  });
  it('systematiken räknas som belopp (−2 mot golv 1,5 är röd)', () => {
    expect(bedomProfil(stat({ systematisk: -2 }), 'diameter', VIDA).status).toBe('röd');
  });
  it('längd bedöms bara på träffprocent (systematik/std-rader ignoreras)', () => {
    const rader: KravRow[] = [...VIDA, { variabel: 'langd', metrik: 'systematisk', riktning: 'lag_bra', tolerans: null, mal: 0.1, golv: 0.2, enhet: 'cm', larm_min_matt: null }];
    expect(bedomProfil(stat({ n: 100, traffPct: 100, systematisk: 5 }), 'langd', rader).status).toBe('ok');
  });
  it('Biometria: grov andel över gränsen styr (binär, mål = golv)', () => {
    expect(bedomProfil(stat({ n: 840, traffPct: 89, grovPct: 0 }), 'diameter', BIO).status).toBe('ok');
    expect(bedomProfil(stat({ n: 840, traffPct: 89, grovPct: 6 }), 'diameter', BIO).status).toBe('röd');
  });
});

describe('tolFranProfil / trCellBedom', () => {
  it('toleransen ur kravprofilen, annars reservvärdet', () => {
    expect(tolFranProfil(VIDA, 'diameter', 9)).toBe(4);
    expect(tolFranProfil(VIDA, 'langd', 9)).toBe(2);
    expect(tolFranProfil([], 'diameter', 9)).toBe(9);
    expect(tolFranProfil(undefined, 'langd', 7)).toBe(7);
  });
  it('under 30 mått: tunt underlag, ingen status', () => {
    expect(trCellBedom(stat({ n: 29 }), 'diameter', VIDA)).toEqual({ tunt: true });
  });
  it('30 mått räcker (trädslagsrapportens grind är 30, inte larm-grindens 150)', () => {
    expect(trCellBedom(stat({ n: 30, traffPct: 77, systematisk: 0.9, standardavv: 4.0 }), 'diameter', VIDA)).toEqual({ tunt: false, status: 'orange' });
    expect(trCellBedom(stat({ n: 190, traffPct: 94.2 }), 'langd', VIDA)).toEqual({ tunt: false, status: 'röd' });
  });
});

describe('Hjälpte åtgärden? — AVRUNDA FÖRST, diffa sedan', () => {
  it('86 → 77 visar −9, aldrig ett tal som inte går att kontrollräkna', () => {
    expect(atgRad(85.6, 77.4, 2, true, 0)).toEqual({ fore: 86, efter: 77, delta: -9, riktning: 'samre' });
  });
  it('under tröskeln är det brus: oförändrad', () => {
    expect(atgRad(74, 75, 2, true, 0).riktning).toBe('oforandrad');
    expect(atgRad(1.2, 1.1, 0.2, false, 1, true).riktning).toBe('oforandrad');
  });
  it('systematiken som belopp: −1,2 → +0,9 är rakare', () => {
    expect(atgRad(-1.2, 0.9, 0.2, false, 1, true).riktning).toBe('battre');
  });
  const effekt = (fore: Partial<VariabelStat> | null, efter: Partial<VariabelStat> | null, kal: string[] = []): AtgardEffekt => ({
    datum: '2026-08-26', text: 'höjde trycket', fore: fore && stat(fore), efter: efter && stat(efter), forTidigt: false, nFore: 600, nEfter: 900, kalibreringarEfter: kal,
  });
  it('Giants fall: spridningen gav sig, träffen följde efter', () => {
    const d = atgardDom(effekt({ traffPct: 74, systematisk: 1.2, standardavv: 4.9 }, { traffPct: 77, systematisk: 1.1, standardavv: 4.3 }))!;
    expect(d.rubrik).toBe('Flaxandet gav sig — trycket var rätt.');
    expect(d.tillagg).toEqual(['Träffen följde efter.']);
    expect(d.std.delta).toBe(-0.6);
  });
  it('kalibrerad efter markören: får inte tillskriva trycket något', () => {
    const d = atgardDom(effekt({ traffPct: 74, systematisk: 1.2, standardavv: 4.9 }, { traffPct: 77, systematisk: 1.1, standardavv: 4.3 }, ['2026-09-02']))!;
    expect(d.rubrik).toBe('Flaxandet gav sig.');
    expect(d.tillagg[1]).toBe('Men kurvan kalibrerades också 2 sep — det går inte att säga vad som hjälpte.');
  });
  it('sämre → "Blev inte bättre"; ingen skillnad → "Ingen mätbar skillnad ännu."', () => {
    expect(atgardDom(effekt({ standardavv: 3 }, { standardavv: 4, systematisk: 0 }))!.rubrik).toBe('Blev inte bättre — spridningen försämrades.');
    expect(atgardDom(effekt({}, {}))!.rubrik).toBe('Ingen mätbar skillnad ännu.');
  });
  it('under grinden (fore/efter null) finns ingen dom', () => {
    expect(atgardDom(effekt(null, null))).toBeNull();
  });
});

describe('objekt — dom och grupp', () => {
  const o = (n: number, traff: number, o2: Partial<ObjektStat> = {}): ObjektStat => ({ object_name: 'Mölleryd', maskin_id: 'G', n, traffPct: traff, systematisk: 0.5, standardavv: 3, grovPct: null, fran: '2026-10-13', till: '2026-10-20', ...o2 });
  const giant: MaskinInfo = { profil: 'VIDA', golvDia: 75, traffPctTotal: 77, n: 1113, trosklar: VIDA };
  it('under 50 mätpunkter: för tunt underlag, ingen dom', () => {
    expect(objektBedom(o(49, 90), giant)).toEqual({ grupp: 'tunt', status: null, faMatningar: false, ingenProfil: false });
    expect(objektDom(o(49, 90), giant)).toMatchObject({ tunn: true, rubrik: 'Mölleryd: för tunt underlag', attribution: 'Bara 49 mätpunkter — för få för en dom.' });
  });
  it('50–100: dom med reservation; över 100: utan', () => {
    expect(objektBedom(o(50, 90), giant).faMatningar).toBe(true);
    expect(objektBedom(o(100, 90), giant).faMatningar).toBe(true);
    expect(objektBedom(o(101, 90), giant).faMatningar).toBe(false);
    expect(objektDom(o(60, 90), giant).reservation).toBe('Bygger på få mätningar (60) — läs domen med reservation.');
  });
  it('under golvet (röd) → "Under kravet", maskinens totala läge avgör attributionen', () => {
    const d = objektDom(o(309, 70), giant);
    expect(objektBedom(o(309, 70), giant).grupp).toBe('under');
    expect(d.ton).toBe('hot');
    expect(d.rubrik).toBe('Mätningen på Mölleryd höll inte måttet');
    // Giant låg på 77 % totalt (golv 75): maskinen var bra i övrigt → avvikelsen sitter på trakten.
    expect(d.attribution).toBe('Maskinen mätte bra i övrigt — avvikelsen är knuten till den här trakten.');
    expect(objektDom(o(309, 70), { ...giant, traffPctTotal: 70 }).attribution).toBe('Maskinen låg under kravet totalt den perioden — det var maskinen, inte trakten.');
  });
  it('orange (under mål, över golv) räknas som godkänd; över målet är "mycket bra"', () => {
    expect(objektBedom(o(200, 78), giant).grupp).toBe('godkand');
    expect(objektDom(o(200, 78, { standardavv: 4 }), giant).rubrik).toBe('Mätningen på Mölleryd var godkänd');
    expect(objektDom(o(200, 90), giant).rubrik).toBe('Mätningen på Mölleryd var mycket bra');
  });
  it('maskin utan kravprofil: tunt underlag med eget skäl', () => {
    expect(objektBedom(o(200, 90), { profil: null, golvDia: null, traffPctTotal: null, n: 0, trosklar: [] })).toMatchObject({ grupp: 'tunt', ingenProfil: true });
    expect(objektDom(o(200, 90), undefined).rubrik).toBe('Mölleryd: ingen kravprofil för maskinen');
  });
  it('"Förnamn Efternamn" saknar traktnamn; ett riktigt traktnamn gör det inte', () => {
    expect(objektSaknarNamn('Anders Svensson')).toBe(true);
    expect(objektSaknarNamn('Anna-Lisa Öhman')).toBe(true);
    expect(objektSaknarNamn('Mölleryd RP J-Hus -25')).toBe(false);
    expect(objektSaknarNamn('Hålabäck au 2025')).toBe(false);
  });
});
