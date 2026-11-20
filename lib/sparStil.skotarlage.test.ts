import { describe, expect, it } from 'vitest';
import { dampatSpar, skotarlageSpar, ROLLFARG_SKOTARE, SKOTARSPAR_STRECK, SKORDARSPAR_SVAGARE, SKOTARSPAR_BAND_BREDD } from './sparStil';

describe('spåren i skotarläget', () => {
  it('skotarens eget spår: ett brett turkost band som inte bleknar, heldraget', () => {
    for (const art of ['egen', 'hist'] as const) {
      const s = skotarlageSpar('skotare', art);
      expect(s.bredd).toEqual(SKOTARSPAR_BAND_BREDD);
      expect(typeof s.opacitet).toBe('number');
      expect(s.opacitet as number).toBeGreaterThanOrEqual(0.75);
      expect(s.farg).toBe(ROLLFARG_SKOTARE);
      expect(s.streck).toBeNull();
      expect(SKOTARSPAR_STRECK).toBeNull();
    }
  });
  it('skördarens spår är lika starkt som annars (Martin 2026-11-11), samma färg och bredd', () => {
    const vanlig = dampatSpar('skordare', 'andras');
    const s = skotarlageSpar('skordare', 'andras');
    expect(s.farg).toBe(vanlig.farg);
    expect(s.bredd).toEqual(vanlig.bredd);
    expect(SKORDARSPAR_SVAGARE).toBe(1);
    expect(s.opacitet).toEqual(vanlig.opacitet);
    expect(s.streck).toBeNull();
  });
  it('skördarens körvy berörs inte', () => {
    expect(skotarlageSpar('skordare', 'egen')).toEqual({ ...dampatSpar('skordare', 'egen'), streck: null });
  });
  it('bandet är bredare än skördarens linje vid varje zoom (annars försvinner det under vägen)', () => {
    const bredd = (uttryck: any[], z: number) => { const p = uttryck.slice(3); for (let i = 0; i < p.length - 2; i += 2) if (z >= p[i] && z <= p[i + 2]) return p[i + 1] + (p[i + 3] - p[i + 1]) * (z - p[i]) / (p[i + 2] - p[i]); return NaN; };
    for (const z of [13, 15, 16, 17]) expect(bredd(SKOTARSPAR_BAND_BREDD as any[], z)).toBeGreaterThan(bredd(dampatSpar('skordare', 'hist').bredd, z));
  });
});
