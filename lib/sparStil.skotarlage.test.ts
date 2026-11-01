import { describe, expect, it } from 'vitest';
import { dampatSpar, skotarlageSpar, ROLLFARG_SKOTARE, SKOTARSPAR_STRECK, SKORDARSPAR_SVAGARE } from './sparStil';

describe('spåren i skotarläget', () => {
  it('skotarens eget spår: skördarens bredd och opacitet, turkos, långa streck', () => {
    for (const art of ['egen', 'hist'] as const) {
      const s = skotarlageSpar('skotare', art);
      expect(s.bredd).toEqual(dampatSpar('skordare', art).bredd);
      expect(s.opacitet).toEqual(dampatSpar('skordare', art).opacitet);
      expect(s.farg).toBe(ROLLFARG_SKOTARE);
      expect(s.streck).toEqual(SKOTARSPAR_STRECK);
    }
  });
  it('skördarens spår är svagare men samma färg och bredd', () => {
    const vanlig = dampatSpar('skordare', 'andras');
    const s = skotarlageSpar('skordare', 'andras');
    expect(s.farg).toBe(vanlig.farg);
    expect(s.bredd).toEqual(vanlig.bredd);
    expect(s.opacitet).toEqual(['*', SKORDARSPAR_SVAGARE, vanlig.opacitet]);
    expect(s.streck).toBeNull();
  });
  it('skördarens körvy berörs inte', () => {
    expect(skotarlageSpar('skordare', 'egen')).toEqual({ ...dampatSpar('skordare', 'egen'), streck: null });
  });
});
