import { describe, expect, it } from 'vitest';
import { morgonkort, morgonkortProv, regnMm, vaderIkon, vaderPerDag, type PmpTimeSeries } from './vader';
import { avstand } from './geo';
import { tunnaSpar, vagTider } from './spar';

const ts = (iso: string, pmean: number, t = 10): PmpTimeSeries => ({ validTime: iso, parameters: [{ name: 'pmean', values: [pmean] }, { name: 't', values: [t] }] });
const NU = Date.parse('2026-10-19T06:00:00Z');

describe('väder', () => {
  it('regn: pmean viktas med stegets längd, bara inom 24 h', () => {
    const serie = [ts('2026-10-19T06:00:00Z', 1), ts('2026-10-19T07:00:00Z', 2), ts('2026-10-19T09:00:00Z', 0), ts('2026-10-20T06:00:00Z', 5), ts('2026-10-20T12:00:00Z', 9)];
    // 1×1 + 2×2 + 0×21 + (ej inom 24 h: steget börjar 06:00 dag 2 = slutet) = 5
    expect(regnMm(serie, NU)).toBeCloseTo(5, 6);
  });
  it('saknade data är null, aldrig 0', () => {
    expect(regnMm(null, NU)).toBeNull();
    expect(regnMm([], NU)).toBeNull();
  });
  it('per dag: regn och temperaturer', () => {
    const d = vaderPerDag([ts('2026-10-19T06:00:00Z', 1, 4), ts('2026-10-19T07:00:00Z', 0, 9), ts('2026-10-20T06:00:00Z', 2, 6)], (ms) => new Date(ms).toISOString().slice(0, 10));
    expect(d[0]).toMatchObject({ datum: '2026-10-19', regnMm: 1, tempMax: 9, tempMin: 4 });
    expect(d[1].datum).toBe('2026-10-20');
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
  const tsSym = (iso: string, pmean: number, t: number, sym: number): PmpTimeSeries => ({ validTime: iso, parameters: [{ name: 'pmean', values: [pmean] }, { name: 't', values: [t] }, { name: 'Wsymb2', values: [sym] }] });
  const dag = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  it('standard är tre dagar, symbolen är den närmast lunch', () => {
    const serie: PmpTimeSeries[] = [];
    for (const d of ['19', '20', '21', '22', '23']) for (const h of ['06', '10', '16']) serie.push(tsSym(`2026-10-${d}T${h}:00:00Z`, 0, 8, h === '10' ? 3 : 1));
    const v = vaderPerDag(serie, dag);
    expect(v).toHaveLength(3);
    expect(v.map((x) => x.symbol)).toEqual([3, 3, 3]);   // 10:00 ligger närmast 10:30, inte 06:00 eller 16:00
    expect(vaderPerDag(serie, dag, 5)).toHaveLength(5);
  });
  it('utan Wsymb2 är symbolen null (ingen gissad ikon)', () => {
    expect(vaderPerDag([ts('2026-10-19T10:00:00Z', 0, 8)], dag)[0].symbol).toBeNull();
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
