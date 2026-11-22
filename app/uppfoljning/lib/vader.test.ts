import { describe, it, expect } from 'vitest';
import { summera, tolkaDaily, tempText, vaderUrl, veckor, isoVeckaNr, type VaderDag } from './vader';

const svar = {
  daily: {
    time: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'],
    precipitation_sum: [0.4, 6.2, null, 12.5],
    temperature_2m_min: [-2.3, 1.0, null, 3.1],
    temperature_2m_max: [4.0, 8.6, null, 11.2],
  },
};

describe('vädret', () => {
  it('summerar regn, regndagar och kallaste/varmaste', () => {
    const s = summera(tolkaDaily(svar), '2026-11-01', '2026-11-04');
    expect(s).toMatchObject({ regnMm: 19, regnDagar: 2, tMin: -2, tMax: 11, dagar: 3, saknas: 1 });
  });
  it('dagar utanför perioden räknas inte', () => {
    expect(summera(tolkaDaily(svar), '2026-11-02', '2026-11-02')).toMatchObject({ regnMm: 6, tMin: 1, tMax: 9, saknas: 0 });
  });
  it('utan värden blir det null, aldrig 0', () => {
    const s = summera([], '2026-11-01', '2026-11-03');
    expect(s.regnMm).toBeNull();
    expect(s.tMin).toBeNull();
    expect(s.saknas).toBe(3);
  });
  it('ett svar utan daily är ett fel', () => {
    expect(() => tolkaDaily({ error: true })).toThrow();
  });
  it('minustecken i temperaturen', () => {
    expect(tempText(-2, 11)).toBe('−2 till 11 °C');
    expect(tempText(null, 3)).toBeNull();
  });
  it('nyliga perioder läses från prognos-api, äldre från arkivet', () => {
    expect(vaderUrl(56.9, 15.2, '2026-11-01', '2026-11-21', '2026-11-21')).toContain('api.open-meteo.com/v1/forecast');
    expect(vaderUrl(56.9, 15.2, '2026-06-01', '2026-06-30', '2026-11-21')).toContain('historical-forecast-api');
  });
});

describe('vädret per vecka', () => {
  it('ISO-veckor, också över årsskiftet', () => {
    expect(isoVeckaNr('2026-10-26')).toBe(44); // måndag
    expect(isoVeckaNr('2026-11-01')).toBe(44); // söndag
    expect(isoVeckaNr('2026-11-02')).toBe(45);
    expect(isoVeckaNr('2025-12-29')).toBe(1);
    expect(isoVeckaNr('2027-01-01')).toBe(53);
    expect(isoVeckaNr('2027-01-04')).toBe(1);
  });

  it('delar perioden mån–sön, kapar första och sista veckan och saknat är aldrig 0', () => {
    const dagar: VaderDag[] = [];
    for (let d = 28; d <= 31; d++) dagar.push({ datum: `2026-10-${d}`, regnMm: 5, tMin: -1, tMax: 4 });
    for (let d = 1; d <= 9; d++) dagar.push({ datum: `2026-11-0${d}`, regnMm: d === 3 ? null : 0.4, tMin: 2, tMax: 8 });
    const v = veckor(dagar, '2026-10-28', '2026-11-09');
    expect(v.map(x => [x.vecka, x.summa.fran, x.summa.till])).toEqual([
      [44, '2026-10-28', '2026-11-01'],
      [45, '2026-11-02', '2026-11-08'],
      [46, '2026-11-09', '2026-11-09'],
    ]);
    expect(v[0].summa.regnMm).toBe(20);
    expect(v[0].summa.regnDagar).toBe(4);
    expect(v[1].summa.regnDagar).toBe(0);
    // Veckornas regn går ihop med hela periodens (inom avrundning).
    expect(summera(dagar, '2026-10-28', '2026-11-09').regnMm).toBe(Math.round(20 + 6 * 0.4 + 0.4 + 0.4));
  });
});
