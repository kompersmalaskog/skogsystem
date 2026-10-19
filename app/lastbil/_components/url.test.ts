import { describe, it, expect } from 'vitest';
import { lasUrl, skrivUrl } from './url';

const NU = new Date(2026, 9, 14);

describe('url', () => {
  it('?flik=fakturering öppnar fakturasidan, med perioden', () => {
    expect(lasUrl('?flik=fakturering&per=2026-09', NU)).toEqual({ sida: 'fakturering', period: { typ: 'man', ar: 2026, man: 9 } });
  });
  it('gamla länkar: ?flik=korningar och ?flik=nu betyder huvudsidan; per= gäller fortfarande', () => {
    expect(lasUrl('?flik=korningar&per=2026-08', NU)).toEqual({ sida: 'huvud', period: { typ: 'man', ar: 2026, man: 8 } });
    expect(lasUrl('?flik=nu&per=2026', NU)).toEqual({ sida: 'huvud', period: { typ: 'ar', ar: 2026 } });
  });
  it('okänt eller ogiltigt = som om det inte stod där', () => {
    expect(lasUrl('?flik=karta&per=imorgon', NU)).toEqual({ sida: 'huvud', period: null });
    expect(lasUrl('', NU)).toEqual({ sida: 'huvud', period: null });
  });
  it('skriver samma som läses (huvudsidan skriver bara per=, ingen flik)', () => {
    expect(skrivUrl('huvud', { typ: 'man', ar: 2026, man: 10 })).toBe('?per=2026-10');
    expect(skrivUrl('fakturering', { typ: 'man', ar: 2026, man: 10 })).toBe('?flik=fakturering&per=2026-10');
    expect(lasUrl(skrivUrl('fakturering', { typ: 'ar', ar: 2026 }), NU)).toEqual({ sida: 'fakturering', period: { typ: 'ar', ar: 2026 } });
    expect(lasUrl(skrivUrl('huvud', { typ: 'ar', ar: 2026 }), NU)).toEqual({ sida: 'huvud', period: { typ: 'ar', ar: 2026 } });
  });
});
