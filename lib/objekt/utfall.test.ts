import { describe, it, expect } from 'vitest';
import { UTFALL_AVVIKELSE_GRANS, avvikandeUtfall } from './utfall';

const NB = '\u00a0';
const o = (status: string, volym: number, utfall: number | null, areal: number | null = null) => ({ status, volym, utfall, areal });

describe('planerat mot utfall', () => {
  it('gränsen är 40 % av utfallet — exakt 40 % är ingen fråga', () => {
    expect(UTFALL_AVVIKELSE_GRANS).toBe(0.4);
    expect(avvikandeUtfall(o('avslutat', 1400, 1000))).toBeNull();
    expect(avvikandeUtfall(o('avslutat', 1401, 1000))).not.toBeNull();
    expect(avvikandeUtfall(o('avslutat', 600, 1000))).toBeNull();
    expect(avvikandeUtfall(o('avslutat', 599, 1000))).not.toBeNull();
  });

  it('de fem misstänkta trakterna i prod 2026-10-20 fångas, med båda talen och per hektar i texten', () => {
    const fem = [
      ['Kroksjömåla', o('avslutat', 860, 315, 7.2)],
      ['Bågskyttebanan', o('avslutat', 3495, 1687, 5.68)],
      ['Toftåsa', o('avslutat', 172, 105, 4.26)],
      ['Bjällerhult', o('avslutat', 146, 301, 0.42)],
      ['Sandåsen (pågående)', o('pagaende', 146, 294, 3.98)],
    ] as const;
    for (const [namn, x] of fem) expect(avvikandeUtfall(x), namn).not.toBeNull();
    expect(avvikandeUtfall(fem[3][1])!.text).toBe(`Planen är 146 m³fub (348 per hektar) och utfallet från maskinerna 301 m³fub (717 per hektar). De avviker 51 %.`);
    expect(avvikandeUtfall(fem[1][1])!.text).toBe(`Planen är 3${NB}495 m³fub (615 per hektar) och utfallet från maskinerna 1${NB}687 m³fub (297 per hektar). De avviker 107 %.`);
  });

  it('normala trakter fångas inte (Älmehult 54 mot 88, Betet 181 mot 273, Hössjömåla 937 mot 724, Skälviken)', () => {
    for (const x of [o('avslutat', 54, 88), o('avslutat', 181, 273), o('avslutat', 937, 724), o('planerad', 1734, 1700)]) expect(avvikandeUtfall(x)).toBeNull();
  });

  it('en trakt som inte är avslutad flaggas bara när utfallet redan överstiger planen — att den skördat mindre är normalt', () => {
    expect(avvikandeUtfall(o('pagaende', 1000, 300))).toBeNull();
    expect(avvikandeUtfall(o('oplanerad', 1000, 300))).toBeNull();
    expect(avvikandeUtfall(o('pagaende', 1000, 1800))).not.toBeNull();
  });

  it('förslaget (utfallet som ny volym) finns bara för en avslutad trakt, avrundat till hela m³fub', () => {
    expect(avvikandeUtfall(o('avslutat', 3495, 1687.4, 5.68))!.forslag).toBe(1687);
    expect(avvikandeUtfall(o('klar', 3495, 1687.6))!.forslag).toBe(1688);
    expect(avvikandeUtfall(o('pagaende', 146, 294, 3.98))!.forslag).toBeNull();
  });

  it('ingen jämförelse utan båda talen: inget utfall, ingen plan, utfall under 1', () => {
    expect(avvikandeUtfall(o('avslutat', 3495, null))).toBeNull();
    expect(avvikandeUtfall({ status: 'avslutat', volym: 3495, areal: 5, utfall: undefined })).toBeNull();
    expect(avvikandeUtfall(o('avslutat', 0, 500))).toBeNull();
    expect(avvikandeUtfall({ status: 'avslutat', volym: null, areal: null, utfall: 500 })).toBeNull();
    expect(avvikandeUtfall(o('avslutat', 100, 0.4))).toBeNull();
  });

  it('utan areal står bara totalerna', () => {
    expect(avvikandeUtfall(o('avslutat', 860, 315))!.text).toBe('Planen är 860 m³fub och utfallet från maskinerna 315 m³fub. De avviker 173 %.');
  });
});
