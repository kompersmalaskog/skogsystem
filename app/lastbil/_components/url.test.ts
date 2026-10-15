import { describe, it, expect } from 'vitest';
import { lasUrl, skrivUrl } from './url';

const NU = new Date(2026, 9, 14);

describe('url', () => {
  it('läser flik och period', () => {
    expect(lasUrl('?flik=fakturering&per=2026-09', NU)).toEqual({ flik: 'fakturering', period: { typ: 'man', ar: 2026, man: 9 } });
    expect(lasUrl('?flik=nu&per=2026', NU)).toEqual({ flik: 'nu', period: { typ: 'ar', ar: 2026 } });
  });
  it('okänt eller ogiltigt = som om det inte stod där', () => {
    expect(lasUrl('?flik=karta&per=imorgon', NU)).toEqual({ flik: null, period: null });
    expect(lasUrl('', NU)).toEqual({ flik: null, period: null });
  });
  it('skriver samma som läses', () => {
    expect(skrivUrl('korningar', { typ: 'man', ar: 2026, man: 10 })).toBe('?flik=korningar&per=2026-10');
    expect(lasUrl(skrivUrl('nu', { typ: 'ar', ar: 2026 }), NU)).toEqual({ flik: 'nu', period: { typ: 'ar', ar: 2026 } });
  });
});
