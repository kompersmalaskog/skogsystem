import { describe, expect, it } from 'vitest';
import { morgonkort, morgonkortProv, regnMm, vaderIkon, vaderPerDag } from './vader';
import { snow1gTillSteg, type PrognosSteg } from '@/lib/smhi-prognos';
import { avstand } from './geo';
import { tunnaSpar, vagTider } from './spar';

const NU = Date.parse('2026-10-19T06:00:00Z');
/** Ett SNOW1g-steg: mängd `mm` över intervallet som slutar vid `iso` och började `start`. */
const steg = (iso: string, mm: number | null, startIso: string | null, temp = 10, symbol: number | null = null): PrognosSteg => ({
  ms: Date.parse(iso), startMs: startIso ? Date.parse(startIso) : null, temp, symbol, vindMs: null, vindRiktning: null, nederbordKategori: null, nederbordMm: mm,
});
const dag = (ms: number) => new Date(ms).toISOString().slice(0, 10);

describe('väder (SNOW1gv1)', () => {
  it('regn: nederbörden är en mängd per intervall — bara delen inom 24 h räknas', () => {
    const serie = [
      steg('2026-10-19T06:00:00Z', null, null),
      steg('2026-10-19T07:00:00Z', 1, '2026-10-19T06:00:00Z'),
      steg('2026-10-19T09:00:00Z', 4, '2026-10-19T07:00:00Z'),
      steg('2026-10-20T06:00:00Z', 9, '2026-10-19T09:00:00Z'),   // 21 h, alla inom fönstret
      steg('2026-10-20T12:00:00Z', 12, '2026-10-20T06:00:00Z'),  // börjar vid fönstrets slut → räknas inte
    ];
    expect(regnMm(serie, NU)).toBeCloseTo(1 + 4 + 9, 6);
  });
  it('ett intervall som korsar fönstrets slut räknas proportionellt, inte hela', () => {
    const serie = [steg('2026-10-20T12:00:00Z', 12, '2026-10-20T00:00:00Z')];   // 12 mm över 12 h; fönstret slutar 06:00 → 6 mm
    expect(regnMm(serie, NU)).toBeCloseTo(6, 6);
  });
  it('saknade data är null, aldrig 0', () => {
    expect(regnMm(null, NU)).toBeNull();
    expect(regnMm([], NU)).toBeNull();
    expect(regnMm([steg('2026-10-19T07:00:00Z', null, '2026-10-19T06:00:00Z')], NU)).toBeNull();
  });
  it('morgonkortets regel räknar rätt med SNOW1g: 10 mm på ett dygn ger kort, 9,9 gör det inte', () => {
    const mm = (m: number) => regnMm([steg('2026-10-19T18:00:00Z', m, '2026-10-19T06:00:00Z')], NU);
    expect(morgonkort({ regnMm: mm(10), brandklass: 1, redanVisatIdag: false })?.rader[0]).toContain('~10 mm');
    expect(morgonkort({ regnMm: mm(9.9), brandklass: 1, redanVisatIdag: false })).toBeNull();
  });
  it('per dag: regn fördelat på datum, högsta och lägsta temperatur', () => {
    const serie = [
      steg('2026-10-19T06:00:00Z', null, null, 4),
      steg('2026-10-19T07:00:00Z', 1, '2026-10-19T06:00:00Z', 9),
      steg('2026-10-20T06:00:00Z', 2, '2026-10-19T07:00:00Z', 6),   // 23 h: 17 h på 19:e (till midnatt), 6 h på 20:e
    ];
    const d = vaderPerDag(serie, dag);
    expect(d[0]).toMatchObject({ datum: '2026-10-19', tempMax: 9, tempMin: 4 });
    expect(d[0].regnMm).toBeCloseTo(1 + 2 * (17 / 23), 6);
    expect(d[1].datum).toBe('2026-10-20');
    expect(d[1].regnMm).toBeCloseTo(2 * (6 / 23), 6);
  });
  it('ett 6-timmarssteg över midnatt delas på datumen (sommartid: datumskiftet vid 22:00 UTC)', () => {
    const lokal = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(ms));
    const serie = [steg('2026-07-02T01:00:00Z', 6, '2026-07-01T19:00:00Z')];   // 21:00–03:00 lokal tid: 3 h före, 3 h efter midnatt
    const d = vaderPerDag(serie, lokal);
    expect(d.map((x) => [x.datum, Math.round((x.regnMm ?? 0) * 10) / 10])).toEqual([['2026-07-01', 3], ['2026-07-02', 3]]);
  });
});

describe('morgonkort', () => {
  it('kort bara vid ≥ 10 mm och/eller brandrisk ≥ 3', () => {
    expect(morgonkort({ regnMm: 9.4, brandklass: 2, redanVisatIdag: false })).toBeNull();
    expect(morgonkort({ regnMm: 20, brandklass: 1, redanVisatIdag: false })?.rader).toEqual(['Regn i morgon, ~20 mm – kör de blöta partierna idag']);
    expect(morgonkort({ regnMm: 0, brandklass: 3, redanVisatIdag: false })?.rader).toEqual(['Brandrisk 3 idag']);
    expect(morgonkort({ regnMm: 12, brandklass: 4, redanVisatIdag: false })?.rader).toHaveLength(2);
  });
  it('högst en gång per dag; okänt väder ger inget kort', () => {
    expect(morgonkort({ regnMm: 30, brandklass: 5, redanVisatIdag: true })).toBeNull();
    expect(morgonkort({ regnMm: null, brandklass: null, redanVisatIdag: false })).toBeNull();
  });
});

describe('spår per väg', () => {
  const M = 1 / 111320;
  const p = (n: number, o: number) => ({ lat: 56.6 + n * M, lng: 15.8 + (o * M) / Math.cos((56.6 * Math.PI) / 180) });
  const vagar = [
    { vag: 'A', linje: [p(0, 0), p(200, 0)] },
    { vag: 'B', linje: [p(0, 100), p(200, 100)] },
  ];
  it('tiden viktas per väg; steg längre än 30 s räknas inte; tid utanför vägar räknas inte', () => {
    const fixar = [
      ...Array.from({ length: 31 }, (_, i) => ({ ...p(i * 5, 1), ts: i * 2000 })),                 // 60 s på A
      ...Array.from({ length: 16 }, (_, i) => ({ ...p(i * 5, 101), ts: 100_000 + i * 2000 })),      // 30 s på B (efter glapp)
      ...Array.from({ length: 10 }, (_, i) => ({ ...p(i * 5, 50), ts: 200_000 + i * 2000 })),       // utanför
    ];
    const t = vagTider(fixar, vagar);
    expect(t.map((x) => x.vag)).toEqual(['A', 'B']);
    expect(t[0].sek).toBe(60);
    expect(t[0].andel + t[1].andel).toBeCloseTo(1, 9);
    expect(t[0].andel).toBeCloseTo(60 / 90, 3);
  });
  it('ingen väg träffad → tom lista', () => {
    expect(vagTider([{ ...p(0, 50), ts: 0 }, { ...p(5, 50), ts: 2000 }], vagar)).toEqual([]);
  });
  it('tunning behåller första och sista och glesar ut', () => {
    const fixar = Array.from({ length: 1000 }, (_, i) => ({ ...p(i * 0.5, 0), ts: i * 1000 }));
    const t = tunnaSpar(fixar);
    expect(t.length).toBeLessThan(120);
    expect(t[0].lat).toBeCloseTo(fixar[0].lat, 9);
    expect(t[t.length - 1].lat).toBeCloseTo(fixar[999].lat, 9);
    expect(avstand(t[0], t[1])).toBeGreaterThanOrEqual(5.9);
  });
});

describe('väder för ⓘ: tre dagar med ikon', () => {
  it('standard är tre dagar, symbolen är den närmast lunch', () => {
    const serie: PrognosSteg[] = [];
    for (const d of ['19', '20', '21', '22', '23']) for (const h of ['06', '10', '16']) serie.push(steg(`2026-10-${d}T${h}:00:00Z`, 0, null, 8, h === '10' ? 3 : 1));
    const v = vaderPerDag(serie, dag);
    expect(v).toHaveLength(3);
    expect(v.map((x) => x.symbol)).toEqual([3, 3, 3]);   // 10:00 ligger närmast 10:30, inte 06:00 eller 16:00
    expect(vaderPerDag(serie, dag, 5)).toHaveLength(5);
  });
  it('utan symbol_code är symbolen null (ingen gissad ikon)', () => {
    expect(vaderPerDag([steg('2026-10-19T10:00:00Z', 0, null, 8)], dag)[0].symbol).toBeNull();
  });
  it('SNOW1g-svar → ikon: symbol_code 1–27 som förut', () => {
    const json = { timeSeries: [{ time: '2026-10-19T10:00:00Z', data: { air_temperature: 8, symbol_code: 19 } }] };
    expect(vaderIkon(vaderPerDag(snow1gTillSteg(json), dag)[0].symbol)).toBe('regn');
  });
  it('Wsymb2 → ikon: alla 27 symboler hamnar i en ikon, okänt är null', () => {
    const ikoner = Array.from({ length: 27 }, (_, i) => vaderIkon(i + 1));
    expect(ikoner.every((x) => x != null)).toBe(true);
    expect([vaderIkon(1), vaderIkon(4), vaderIkon(6), vaderIkon(7), vaderIkon(9), vaderIkon(11), vaderIkon(15), vaderIkon(20), vaderIkon(21), vaderIkon(24)])
      .toEqual(['sol', 'halvklart', 'moln', 'dimma', 'regn', 'aska', 'snoblandat', 'regn', 'aska', 'snoblandat']);
    expect([vaderIkon(0), vaderIkon(28), vaderIkon(null), vaderIkon(undefined), vaderIkon(2.5)]).toEqual([null, null, null, null, null]);
  });
});

describe('morgonkortProv (testbannern)', () => {
  it('gäller något: samma kort som det riktiga', () => {
    expect(morgonkortProv(20, 1)).toEqual(morgonkort({ regnMm: 20, brandklass: 1, redanVisatIdag: false }));
    expect(morgonkortProv(0, 4)?.rader).toEqual(['Brandrisk 4 idag']);
  });
  it('gäller inget: ett märkt provkort med värdena — aldrig ett kort som ser riktigt ut', () => {
    const k = morgonkortProv(3.2, 2);
    expect(k.rader).toEqual(['Provkörning – inget kort hade visats nu (regn 3 mm, brandrisk 2)']);
    expect(morgonkortProv(null, null).rader[0]).toContain('regn okänt, brandrisk okänt');
  });
  it('tröskelreglerna för det riktiga kortet är oförändrade', () => {
    expect(morgonkort({ regnMm: 9.9, brandklass: 2, redanVisatIdag: false })).toBeNull();
    expect(morgonkort({ regnMm: 10, brandklass: 1, redanVisatIdag: false })).not.toBeNull();
    expect(morgonkort({ regnMm: 0, brandklass: 3, redanVisatIdag: false })).not.toBeNull();
  });
});
