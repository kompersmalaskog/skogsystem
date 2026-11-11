import { describe, it, expect } from 'vitest';
import { summera, siffraRader, veckansMandag, farskText, skotarSiffror } from './produktionSiffror';

describe('produktionssiffrorna (skördarens filer)', () => {
  const prod = [
    { datum: '2026-11-11', volym_m3sub: 20, stammar: 200, skapad_tid: '2026-11-11T13:10:00Z' },
    { datum: '2026-11-11', volym_m3sub: 18, stammar: 212, skapad_tid: '2026-11-11T14:22:00Z' },
  ];
  const tid = [{ datum: '2026-11-11', processing_sek: 3600 * 5, terrain_sek: 1800, other_work_sek: 1800, bransle_liter: 53.2 }];
  it('viktade snitt, aldrig snitt av snitt', () => {
    const s = summera(prod, tid);
    expect(s.m3).toBe(38);
    expect(s.stammar).toBe(412);
    expect(s.medelstam).toBeCloseTo(38 / 412, 6);
    expect(s.g15h).toBe(6);
    expect(s.m3PerG15h).toBeCloseTo(38 / 6, 6);
    expect(s.dieselPerM3).toBeCloseTo(53.2 / 38, 6);
  });
  it('raderna i ord; tid som saknas ger ingen G15- eller diesel-rad (aldrig 0)', () => {
    expect(siffraRader(summera(prod, tid)).map((r) => `${r.titel} ${r.varde}`)).toEqual([
      'Virke 38 m³', 'Stammar 412', 'Medelstam 0,09 m³', 'Per G15-timme 6,3 m³', 'Diesel 1,4 l/m³',
    ]);
    expect(siffraRader(summera(prod, null)).map((r) => r.id)).toEqual(['virke', 'stammar', 'medelstam']);
    expect(siffraRader(summera([], tid))).toEqual([]);
  });
  it('veckans måndag', () => {
    expect(veckansMandag('2026-11-11')).toBe('2026-11-09');
    expect(veckansMandag('2026-11-09')).toBe('2026-11-09');
    expect(veckansMandag('2026-11-15')).toBe('2026-11-09');
  });
  it('färskheten i svensk tid', () => {
    expect(farskText(prod)).toBe('Ur maskinens filer · senaste 15:22');
    expect(farskText([{ datum: 'x' }])).toBeNull();
  });
});

describe('skotarSiffror', () => {
  const lass = (id: string, datum: string, m3: number, extra: Record<string, unknown> = {}) => ({
    id, maskinId: 'A1', datum, status: 'bekraftat', bekraftadAv: 'forare', delar: [{ rader: [{ sortiment: 'x', m3 }] }], ...extra,
  }) as any;
  it('räknar bara maskinens bekräftade lass i perioden', () => {
    const r = skotarSiffror([lass('1', '2026-11-10', 15), lass('2', '2026-11-11', 17), lass('3', '2026-11-11', 9, { status: 'struket' }), lass('4', '2026-11-11', 20, { maskinId: 'B' })], 'A1', '2026-11-11', '2026-11-11');
    expect(r.map((x) => x.varde)).toEqual(['1', '17 m³', '17 m³']);
  });
  it('inga lass = inga rader, aldrig 0', () => {
    expect(skotarSiffror([], 'A1', '2026-11-11', '2026-11-11')).toEqual([]);
  });
});
