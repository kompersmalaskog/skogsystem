import { describe, expect, it } from 'vitest';
import { morgonkort, regnMm, vaderPerDag, type PmpTimeSeries } from './vader';
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
