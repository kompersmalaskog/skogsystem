import { describe, expect, it, vi } from 'vitest';
import { hamtaPrognos, narmasteSteg, nederbordMellan, nederbordPerDatum, snow1gTillSteg, snow1gUrl } from './smhi-prognos';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Ett SNOW1gv1-svar i det format migrationsbeskrivningen (MagicMirror#4081) och ha-smhi visar: `time`, platt `data`, 9999 = saknas.
const SVAR = {
  createdTime: '2026-10-19T05:30:00Z',
  referenceTime: '2026-10-19T05:00:00Z',
  geometry: { type: 'Point', coordinates: [15.8, 56.6] },
  timeSeries: [
    { time: '2026-10-19T06:00:00Z', data: { air_temperature: 4.2, wind_speed: 3.1, wind_from_direction: 225, symbol_code: 3, predominant_precipitation_type_at_surface: 0 } },
    { time: '2026-10-19T07:00:00Z', intervalParametersStartTime: '2026-10-19T06:00:00Z', data: { air_temperature: 5, symbol_code: 18, precipitation_amount_mean: 1.5, predominant_precipitation_type_at_surface: 3 } },
    { time: '2026-10-19T13:00:00Z', intervalParametersStartTime: '2026-10-19T07:00:00Z', data: { air_temperature: 9999, symbol_code: 9999, precipitation_amount_mean: 6 } },
    { time: '2026-10-19T14:00:00Z', data: { air_temperature: 7, precipitation_amount_mean_deterministic: 2 } },   // utan intervalstart: börjar där förra steget slutade
  ],
};

describe('snow1gTillSteg', () => {
  const s = snow1gTillSteg(SVAR);
  it('läser time och platt data med SNOW1g-namnen', () => {
    expect(s).toHaveLength(4);
    expect(s[0]).toMatchObject({ ms: Date.parse('2026-10-19T06:00:00Z'), temp: 4.2, vindMs: 3.1, vindRiktning: 225, symbol: 3, nederbordKategori: 0, nederbordMm: null });
    expect(s[1]).toMatchObject({ temp: 5, symbol: 18, nederbordMm: 1.5, nederbordKategori: 3, startMs: Date.parse('2026-10-19T06:00:00Z') });
  });
  it('9999 är saknat värde (null), aldrig ett tal', () => {
    expect(s[2].temp).toBeNull();
    expect(s[2].symbol).toBeNull();
    expect(s[2].nederbordMm).toBe(6);
  });
  it('intervall utan start börjar där förra steget slutade; deterministisk nederbörd används bara om medelvärdet saknas', () => {
    expect(s[3].startMs).toBe(Date.parse('2026-10-19T13:00:00Z'));
    expect(s[3].nederbordMm).toBe(2);
  });
  it('fel format ger tom lista, inte ett kast (PMP3g-svar tolkas aldrig som SNOW1g)', () => {
    expect(snow1gTillSteg(null)).toEqual([]);
    expect(snow1gTillSteg({})).toEqual([]);
    expect(snow1gTillSteg({ timeSeries: [{ validTime: '2026-10-19T06:00:00Z', parameters: [{ name: 't', values: [5] }] }] })).toEqual([]);
  });
  it('osorterade steg sorteras', () => {
    const r = snow1gTillSteg({ timeSeries: [{ time: '2026-10-19T08:00:00Z', data: {} }, { time: '2026-10-19T07:00:00Z', data: {} }] });
    expect(r.map((x) => x.ms)).toEqual([Date.parse('2026-10-19T07:00:00Z'), Date.parse('2026-10-19T08:00:00Z')]);
  });
});

describe('nederbörd som mängd per intervall', () => {
  const s = snow1gTillSteg(SVAR);
  it('mellan två tidpunkter räknas varje intervall proportionellt', () => {
    // 06–07: 1,5 mm; 07–13: 6 mm (1 mm/h); 13–14: 2 mm. Fönster 06:30–09:00 = 0,75 + 2 mm.
    expect(nederbordMellan(s, Date.parse('2026-10-19T06:30:00Z'), Date.parse('2026-10-19T09:00:00Z'))).toBeCloseTo(0.75 + 2, 6);
    expect(nederbordMellan(s, Date.parse('2026-10-19T00:00:00Z'), Date.parse('2026-10-20T00:00:00Z'))).toBeCloseTo(9.5, 6);
  });
  it('inget fönster med data → null, inte 0', () => {
    expect(nederbordMellan(s, Date.parse('2026-10-20T00:00:00Z'), Date.parse('2026-10-21T00:00:00Z'))).toBeNull();
  });
  it('per datum: summan över alla datum = summan av intervallen', () => {
    const utc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const per = nederbordPerDatum(s, utc);
    expect(Array.from(per.values()).reduce((a, b) => a + b, 0)).toBeCloseTo(9.5, 6);
    expect(per.size).toBe(1);
  });
});

describe('narmasteSteg', () => {
  it('närmaste steg med temperatur, hoppar över dem utan', () => {
    const s = snow1gTillSteg(SVAR);
    expect(narmasteSteg(s, Date.parse('2026-10-19T12:50:00Z'))?.ms).toBe(Date.parse('2026-10-19T14:00:00Z'));   // 13:00 saknar temperatur och hoppas över
    expect(narmasteSteg([], Date.now())).toBeNull();
  });
});

describe('hamtaPrognos', () => {
  it('använder SNOW1gv1 — aldrig pmp3g', () => {
    expect(snow1gUrl(56.6, 15.8)).toBe('https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/15.8000/lat/56.6000/data.json');
  });
  it('direkt väg först; går den inte tar proxyn över; går ingen är svaret null', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (u: string) => {
      urls.push(u);
      if (u.includes('opendata-download-metfcst')) throw new TypeError('Failed to fetch');
      return { ok: true, json: async () => SVAR } as any;
    });
    expect((await hamtaPrognos(56.6, 15.8, true))?.length).toBe(4);
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain('/api/smhi-prognos?lat=56.6000&lon=15.8000');
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    expect(await hamtaPrognos(56.6, 15.8, true)).toBeNull();
    vi.stubGlobal('fetch', async () => ({ ok: false, json: async () => ({}) }) as any);
    expect(await hamtaPrognos(56.6, 15.8, true)).toBeNull();
    vi.unstubAllGlobals();
  });
  it('på servern (utan proxy) provas bara SMHI', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (u: string) => { urls.push(u); throw new Error('nej'); });
    expect(await hamtaPrognos(56.6, 15.8, false)).toBeNull();
    expect(urls).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});

describe('vakt: PMP3gv2 är stängd (2026-03-31) — ingen kod får anropa den', () => {
  const rot = join(__dirname, '..');
  const hitta = (dir: string, ut: string[] = []): string[] => {
    for (const n of readdirSync(dir)) {
      if (['node_modules', '.next', '.git', 'docs', 'supabase', 'public'].includes(n)) continue;
      const p = join(dir, n);
      if (statSync(p).isDirectory()) hitta(p, ut);
      else if (/\.(ts|tsx|js|mjs|py)$/.test(n)) ut.push(p);
    }
    return ut;
  };
  it('ingen källfil anropar category/pmp3g', () => {
    const traffar = hitta(rot).filter((f) => !f.endsWith('smhi-prognos.test.ts') && /category\/pmp3g/.test(readFileSync(f, 'utf8')));
    expect(traffar.map((f) => f.replace(rot, ''))).toEqual([]);
  });
});
