import { describe, expect, it } from 'vitest';
import { fmtTid, minFranTimmar, timmarForFaktura, traillertid, type TidBen, type TidRunda } from './traillertid';

// Rundorna är formade som prod (svensk tid = UTC+2 i september/oktober).
const runda = (start: string, slut: string | null, autoAv: string | null = null): TidRunda => ({ start, slut, autoAv });

describe('regel A: rundan delas vid varje lossning, hemresan följer den sista flytten', () => {
  // 25 sep: 08:18–14:57, två flyttar. Elefant lossad 11:09 (18 km, faktureras inte på tid), Wisent lossad 13:30 (44 km).
  const r25 = runda('2026-09-25T06:18:00Z', '2026-09-25T12:57:00Z');
  const ben25: TidBen[] = [{ id: 'wisent', sluttid: '2026-09-25T11:30:00Z' }, { id: 'elefant', sluttid: '2026-09-25T09:09:00Z' }];

  it('första flytten: från att bilen lämnar till lossningen', () => {
    expect(traillertid('elefant', r25, ben25)).toMatchObject({ lage: 'ok', min: 171, fran: r25.start, till: '2026-09-25T09:09:00Z', forst: true, medHem: false });
  });
  it('sista flytten: från förra lossningen tills bilen är tillbaka (hemresan med)', () => {
    expect(traillertid('wisent', r25, ben25)).toMatchObject({ lage: 'ok', min: 228, fran: '2026-09-25T09:09:00Z', till: r25.slut, forst: false, medHem: true });
  });
  it('delarna blir tillsammans exakt hela rundan — ingen tid försvinner, ingen räknas två gånger', () => {
    // 12 okt: tre flyttar på en runda 11:30–19:33.
    const r = runda('2026-10-12T09:30:00Z', '2026-10-12T17:33:00Z');
    const ben: TidBen[] = [
      { id: 'a', sluttid: '2026-10-12T11:46:00Z' }, { id: 'b', sluttid: '2026-10-12T14:10:00Z' }, { id: 'c', sluttid: '2026-10-12T16:02:00Z' },
    ];
    const delar = ben.map(b => traillertid(b.id, r, ben)).map(f => (f.lage === 'ok' ? f.min : NaN));
    expect(delar).toEqual([136, 144, 203]);
    expect(delar.reduce((s, m) => s + m, 0)).toBe(8 * 60 + 3);
  });
  it('en flytt ensam på rundan får hela rundan', () => {
    const r = runda('2026-10-06T13:52:00Z', '2026-10-06T17:55:00Z');
    expect(traillertid('x', r, [{ id: 'x', sluttid: '2026-10-06T16:10:00Z' }])).toMatchObject({ min: 243, medHem: true, varning: null });
  });
});

describe('inget förslag när det inte går att räkna — orsaken sägs, aldrig 0', () => {
  const r = runda('2026-10-06T13:52:00Z', '2026-10-06T17:55:00Z');
  it('rundan pågår', () => {
    expect(traillertid('x', runda('2026-10-06T13:52:00Z', null), [{ id: 'x', sluttid: '2026-10-06T16:10:00Z' }])).toEqual({ lage: 'saknas', orsak: 'Rundan pågår fortfarande' });
  });
  it('en flytt i rundan saknar lossningstid', () => {
    expect(traillertid('x', r, [{ id: 'x', sluttid: '2026-10-06T16:10:00Z' }, { id: 'y', sluttid: null }])).toEqual({ lage: 'saknas', orsak: 'En flytt i rundan saknar lossningstid' });
  });
  it('flytten finns inte i rundan, eller tiderna går baklänges', () => {
    expect(traillertid('z', r, [{ id: 'x', sluttid: '2026-10-06T16:10:00Z' }]).lage).toBe('saknas');
    expect(traillertid('x', runda('2026-10-06T17:55:00Z', '2026-10-06T13:52:00Z'), [{ id: 'x', sluttid: '2026-10-06T16:10:00Z' }])).toEqual({ lage: 'saknas', orsak: 'Rundans tider går inte ihop' });
  });
});

describe('varningar — bara text, förslaget står kvar', () => {
  it('över 6 timmar: kolla att rundan avslutades i tid (21 aug: 6 h 48 min)', () => {
    const f = traillertid('x', runda('2026-08-21T05:29:00Z', '2026-08-21T12:17:00Z'), [{ id: 'x', sluttid: '2026-08-21T09:00:00Z' }]);
    expect(f).toMatchObject({ lage: 'ok', min: 408, varning: 'Över 6 timmar – kolla att rundan avslutades i tid' });
  });
  it('precis 6 timmar varnar inte', () => {
    const f = traillertid('x', runda('2026-08-21T05:00:00Z', '2026-08-21T11:00:00Z'), [{ id: 'x', sluttid: '2026-08-21T09:00:00Z' }]);
    expect(f).toMatchObject({ min: 360, varning: null });
  });
  it('rundan stängdes av nattjobbet ("Kör hem" trycktes aldrig)', () => {
    const f = traillertid('x', runda('2026-08-21T05:00:00Z', '2026-08-21T07:00:00Z', 'cron_sakerhetsnat'), [{ id: 'x', sluttid: '2026-08-21T06:00:00Z' }]);
    expect(f).toMatchObject({ lage: 'ok', varning: 'Rundan avslutades inte i appen – kolla tiden' });
  });
});

describe('tiden i appen och på fakturan', () => {
  it('i appen: timmar och minuter, aldrig decimaler', () => {
    expect(fmtTid(228)).toBe('3 h 48 min');
    expect(fmtTid(45)).toBe('45 min');
    expect(fmtTid(120)).toBe('2 h');
  });
  it('på fakturan: två decimaler, räknat sist ur hela minuter — och tillbaka utan att tappa en minut', () => {
    expect(timmarForFaktura(228)).toBe(3.8);
    expect(timmarForFaktura(229)).toBe(3.82);
    for (let m = 1; m <= 600; m++) expect(minFranTimmar(timmarForFaktura(m))).toBe(m);
  });
});

describe('lastning hemma: tiden börjar när flytten började, inte när bilen lämnade basen (Martin 2026-10-26)', () => {
  // Wisent 26 okt (prod): bilen startad 11:54 vid LBC, lastad 12:08, rundan 12:09:58–13:40:08, lossad 12:57.
  const r = runda('2026-10-26T11:09:58Z', '2026-10-26T12:40:08Z');
  const ben: TidBen[] = [{ id: 'wisent', starttid: '2026-10-26T10:54:07Z', sluttid: '2026-10-26T11:57:41Z' }];

  it('Wisent 26 okt: 11:54–13:40 = 1 h 46 min, inte rundans 1 h 30 min', () => {
    expect(traillertid('wisent', r, ben)).toMatchObject({ lage: 'ok', min: 106, fran: '2026-10-26T10:54:07Z', lastningFore: true, medHem: true });
  });
  it('flytten började efter att bilen åkt (hämtad ute) → rundans start som förut', () => {
    const ute: TidBen[] = [{ id: 'x', starttid: '2026-10-26T11:40:00Z', sluttid: '2026-10-26T11:57:41Z' }];
    expect(traillertid('x', r, ute)).toMatchObject({ min: 90, fran: r.start, lastningFore: false });
  });
  it('mer än en timme före rundan är ingen lastning (flytt registrerad kvällen före) → rundans start', () => {
    const kvall: TidBen[] = [{ id: 'x', starttid: '2026-10-26T09:00:00Z', sluttid: '2026-10-26T11:57:41Z' }];
    expect(traillertid('x', r, kvall)).toMatchObject({ min: 90, fran: r.start, lastningFore: false });
  });
  it('bara den FÖRSTA flytten: en senare flytts tidiga starttid flyttar inte delningen', () => {
    const tva: TidBen[] = [
      { id: 'a', starttid: '2026-10-26T11:20:00Z', sluttid: '2026-10-26T11:30:00Z' },
      { id: 'b', starttid: '2026-10-26T10:50:00Z', sluttid: '2026-10-26T12:00:00Z' },
    ];
    expect(traillertid('b', r, tva)).toMatchObject({ fran: '2026-10-26T11:30:00Z', lastningFore: false });
    expect(traillertid('a', r, tva)).toMatchObject({ fran: r.start, lastningFore: false });
  });
  it('utan starttid som förut', () => {
    expect(traillertid('x', r, [{ id: 'x', sluttid: '2026-10-26T11:57:41Z' }])).toMatchObject({ min: 90, lastningFore: false });
  });
});
