import { describe, it, expect } from 'vitest';
import {
  aktivaMaskinIds, artSnitt, effektivMaskin, filtreraKalib, heroFilnamnFor, heroMaskinId, rapportBedomning, rapportDom,
  rapportSedan, rapportSnitt, tradslagRader,
} from './rapport';
import { objektRader } from './objekt';
import { dagrubrik, fmtDagMan, manadNamn, stegManad } from './datum';
import { aggregeraDagFiltrerat, dagstatusText, filtreradSammanfattning, legendRader, maskinStatusText, tommaCeller } from './kalender';
import { antalText, cap, kontrollStatusText, stockText } from './text';
import type { AlleMaskin, BedomningResp, CalDag, CalResponse, FaktKalibrering, ObjektData, TradslagData, VariabelStat } from './typer';

const kal = (o: Partial<FaktKalibrering>): FaktKalibrering => ({
  id: 1, datum: '2026-10-20', maskin_id: 'G', operator_id: null, tradslag: 'GRAN', antal_kontrollstammar: 1, antal_kontrollstockar: 5,
  langd_avvikelse_snitt_cm: 0, langd_avvikelse_min_cm: 0, langd_avvikelse_max_cm: 0, dia_avvikelse_snitt_mm: 0, dia_avvikelse_min_mm: 0, dia_avvikelse_max_mm: 0,
  status: 'OK', filnamn: 'a.hqc', skapad_tid: 'x', ...o,
});
const maskiner: AlleMaskin[] = [
  { maskin_id: 'G', tillverkare: null, modell: null, visningsnamn: 'Giant', aktiv_till: null },
  { maskin_id: 'S', tillverkare: null, modell: null, visningsnamn: 'Såld', aktiv_till: '2020-01-01' },
];

describe('urval', () => {
  it('sålda maskiner är inte aktiva; vald maskin som försvunnit faller tillbaka på alla', () => {
    expect(aktivaMaskinIds(maskiner)).toEqual(['G']);
    expect(effektivMaskin('S', maskiner)).toBe('S');
    expect(effektivMaskin('X', maskiner)).toBe('all');
    expect(effektivMaskin('all', maskiner)).toBe('all');
  });
  it('alla = bara aktiva; vald = den maskinens kontroller', () => {
    const all = [kal({ id: 1, maskin_id: 'G' }), kal({ id: 2, maskin_id: 'S' })];
    const aktiv = (id: string) => id === 'G';
    expect(filtreraKalib(all, 'all', aktiv).map(k => k.id)).toEqual([1]);
    expect(filtreraKalib(all, 'S', aktiv).map(k => k.id)).toEqual([2]);
  });
  it('Senaste-fliken: vald maskin, annars senaste kontrollen från en AKTIV maskin', () => {
    const all = [kal({ id: 2, maskin_id: 'S', filnamn: 's.hqc' }), kal({ id: 1, maskin_id: 'G', filnamn: 'g.hqc' })];
    const aktiv = (id: string) => id === 'G';
    expect(heroMaskinId('all', all, aktiv)).toBe('G');
    expect(heroMaskinId('S', all, aktiv)).toBe('S');
    expect(heroMaskinId('all', [], aktiv)).toBeNull();
    expect(heroFilnamnFor('G', all)).toBe('g.hqc');
    expect(heroFilnamnFor(null, all)).toBe('s.hqc');
  });
});

describe('rapporttal — viktat på antal stockar, avrundat en gång', () => {
  it('artsnittet viktas på antal_kontrollstockar och avrundas till en decimal', () => {
    const a = artSnitt([
      kal({ tradslag: 'GRAN', antal_kontrollstockar: 3, langd_avvikelse_snitt_cm: 1, dia_avvikelse_snitt_mm: 2 }),
      kal({ tradslag: 'Gran', antal_kontrollstockar: 1, langd_avvikelse_snitt_cm: -1, dia_avvikelse_snitt_mm: 6 }),
      kal({ tradslag: 'TALL', antal_kontrollstockar: 2, langd_avvikelse_snitt_cm: 0.5, dia_avvikelse_snitt_mm: -1 }),
    ]);
    expect(a.gran).toEqual({ count: 2, totalStockar: 4, lenDiff: 0.5, diaDiff: 3 });
    expect(a.tall).toEqual({ count: 1, totalStockar: 2, lenDiff: 0.5, diaDiff: -1 });
  });
  it('rapportsnittet', () => {
    expect(rapportSnitt([kal({ antal_kontrollstockar: 3, langd_avvikelse_snitt_cm: 1, dia_avvikelse_snitt_mm: 2 }), kal({ antal_kontrollstockar: 1, langd_avvikelse_snitt_cm: -1, dia_avvikelse_snitt_mm: 6 })]))
      .toEqual({ totalStockar: 4, avgLen: 0.5, avgDia: 3 });
    expect(rapportSnitt([])).toEqual({ totalStockar: 0, avgLen: 0, avgDia: 0 });
  });
  it('sidfotens "sedan" = första kontrollen i urvalet', () => {
    expect(rapportSedan([kal({ datum: '2026-10-20' }), kal({ datum: '2026-08-24' })])).toBe('augusti 2026');
    expect(rapportSedan([])).toBe('–');
  });
  it('bedömning mot profilen bara när just den maskinen är vald och bedömningen är dens', () => {
    const b = { ok: true, maskin_id: 'G', profil: 'VIDA', fonster: null, diameter: null, langd: null, trosklar: [] } as BedomningResp;
    expect(rapportBedomning('G', b)).toBe(b);
    expect(rapportBedomning('all', b)).toBeNull();
    expect(rapportBedomning('H', b)).toBeNull();
    expect(rapportBedomning('G', null)).toBeNull();
  });
  it('utan profil faller domen tillbaka på snitt-toleransen (dia ±4 / längd ±2)', () => {
    expect(rapportDom(null, 1, 3).inomTolerans).toBe(true);
    expect(rapportDom(null, 2.5, 3).inomTolerans).toBe(false);
    expect(rapportDom(null, 1, 4.5).inomTolerans).toBe(false);
  });
  it('trädslagsrader utan underlag (båda under 30) göms', () => {
    const s = (n: number): VariabelStat => ({ n, traffPct: 80, systematisk: 0, standardavv: 3, grovPct: null, tolerans: 4, grovTolerans: null });
    const d: TradslagData = { profil: 'VIDA', trosklar: [], tradslag: [
      { tradslag: 'GRAN', diameter: s(700), langd: s(190) }, { tradslag: 'BJÖRK', diameter: s(33), langd: s(10) }, { tradslag: 'LÖV', diameter: s(12), langd: s(4) },
    ] };
    expect(tradslagRader(d).map(t => t.tradslag)).toEqual(['GRAN', 'BJÖRK']);
    expect(tradslagRader(null)).toEqual([]);
  });
});

describe('objekt — lista och sökning', () => {
  const data: ObjektData = { objekt: [
    { object_name: 'Äldre', maskin_id: 'G', n: 200, traffPct: 90, systematisk: 0, standardavv: 3, grovPct: null, fran: '2026-01-01', till: '2026-02-01' },
    { object_name: 'Mölleryd', maskin_id: 'G', n: 200, traffPct: 90, systematisk: 0, standardavv: 3, grovPct: null, fran: '2026-10-13', till: '2026-10-20' },
  ], maskiner: {} };
  const nu = Date.parse('2026-10-21T12:00:00Z');
  it('senast först; äldre än 183 dagar märks gamla', () => {
    const { rader, soker } = objektRader(data, '', nu);
    expect(soker).toBe(false);
    expect(rader.map(r => [r.o.object_name, r.gammal])).toEqual([['Mölleryd', false], ['Äldre', true]]);
  });
  it('sökning är skiftlägesokänslig och trimmad', () => {
    const { rader, soker } = objektRader(data, '  MÖLLE ', nu);
    expect(soker).toBe(true);
    expect(rader.map(r => r.o.object_name)).toEqual(['Mölleryd']);
  });
});

describe('kalendern', () => {
  const dag = (datum: string, veckodag: number, status: CalDag['status'], maskiner: CalDag['maskiner'] = []): CalDag => ({ datum, veckodag, status, maskiner });
  const m = (maskin_id: string, status: CalDag['status'], okand = false): CalDag['maskiner'][number] => ({ maskin_id, tillverkare: null, modell: null, status, volym_m3sub: 1, huvudtyp: null, huvudtyp_okand: okand, trosklar: { min_volym_m3sub: 1 }, kontroller: [] });
  const cal: CalResponse = {
    manad: '2026-10', sammanfattning: { produktionsdagar: 3, kompletta: 1, saknas: 1, varningar: 1, okand_huvudtyp_dagar: 0 },
    dagar: [dag('2026-10-01', 4, 'komplett', [m('G', 'komplett'), m('H', 'saknas')]), dag('2026-10-02', 5, 'saknas', [m('G', 'saknas', true)]), dag('2026-10-03', 6, 'varning', [m('G', 'varning')]), dag('2026-10-04', 7, 'inaktiv')],
  };
  it('en dag för en vald maskin = maskinens egen status; saknas maskinen är dagen inaktiv', () => {
    expect(aggregeraDagFiltrerat(cal.dagar[0], 'all')).toBe('komplett');
    expect(aggregeraDagFiltrerat(cal.dagar[0], 'H')).toBe('saknas');
    expect(aggregeraDagFiltrerat(cal.dagar[1], 'H')).toBe('inaktiv');
  });
  it('sammanfattningen räknas om efter filtret; "alla" använder serverns', () => {
    expect(filtreradSammanfattning(cal, 'all')).toBe(cal.sammanfattning);
    expect(filtreradSammanfattning(cal, 'G')).toEqual({ produktionsdagar: 3, kompletta: 1, saknas: 1, varningar: 1, okand_huvudtyp_dagar: 1 });
    expect(filtreradSammanfattning(cal, 'H')).toEqual({ produktionsdagar: 1, kompletta: 0, saknas: 1, varningar: 0, okand_huvudtyp_dagar: 0 });
  });
  it('rutnätet: tomma celler före (måndag = 1) och efter (veckan fylls till söndag)', () => {
    expect(tommaCeller(cal)).toEqual({ leadingEmpty: 3, trailingEmpty: 0 });
    expect(tommaCeller({ ...cal, dagar: cal.dagar.slice(0, 2) })).toEqual({ leadingEmpty: 3, trailingEmpty: 2 });
    expect(tommaCeller({ ...cal, dagar: [] })).toEqual({ leadingEmpty: 0, trailingEmpty: 0 });
  });
  it('legenden visar bara statusar som finns den här månaden', () => {
    expect(legendRader({ ...cal, dagar: [cal.dagar[0]] }, 'all').map(r => r.st)).toEqual(['komplett']);
    expect(legendRader(cal, 'all').map(r => r.st)).toEqual(['komplett', 'saknas', 'varning']);
  });
  it('status i klartext', () => {
    expect(dagstatusText('komplett')).toBe('Inom tolerans');
    expect(dagstatusText('inaktiv')).toBe('Inaktiv');
    expect(maskinStatusText('komplett')).toBe('Kontroll lämnad');
    expect(maskinStatusText('varning')).toBe('Varning');
  });
});

describe('datum och text', () => {
  it('månadsnamn, steg och dagrubrik', () => {
    expect(manadNamn('2026-10')).toBe('Oktober 2026');
    expect(stegManad('2026-01', -1)).toBe('2025-12');
    expect(stegManad('2026-12', 1)).toBe('2027-01');
    expect(dagrubrik('2026-10-20')).toBe('Tisdag 20 oktober');
    expect(fmtDagMan('2026-08-26T10:00:00Z')).toBe('26 aug');
  });
  it('pluralis och versaler', () => {
    expect(stockText(1)).toBe('1 stock');
    expect(stockText(2)).toBe('2 stockar');
    expect(antalText(0, 'stam', 'stammar')).toBe('0 stammar');
    expect(cap('GRAN')).toBe('Gran');
    expect(cap('')).toBe('');
    expect(kontrollStatusText('VARNING')).toBe('Varning');
    expect(kontrollStatusText('ANNAT')).toBe('ANNAT');
  });
});
