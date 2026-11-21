import { describe, it, expect } from 'vitest';
import { summera, tolkaDaily, tempText, vaderUrl } from './vader';

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
