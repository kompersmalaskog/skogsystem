import { describe, it, expect } from 'vitest';
import { lasUrl, skrivUrl } from './url';

const NU = new Date(2026, 9, 14);
const OKT = { typ: 'man', ar: 2026, man: 10 } as const;

describe('url', () => {
  it('?flik=fakturering öppnar fakturasidan, med perioden', () => {
    expect(lasUrl('?flik=fakturering&per=2026-09', NU)).toEqual({ sida: 'fakturering', period: { typ: 'man', ar: 2026, man: 9 }, ar: null });
  });
  it('gamla länkar: ?flik=korningar och ?flik=nu betyder huvudsidan; per= gäller fortfarande', () => {
    expect(lasUrl('?flik=korningar&per=2026-08', NU)).toEqual({ sida: 'huvud', period: { typ: 'man', ar: 2026, man: 8 }, ar: null });
    expect(lasUrl('?flik=nu&per=2026-08', NU)).toEqual({ sida: 'huvud', period: { typ: 'man', ar: 2026, man: 8 }, ar: null });
  });
  it('gamla länkar med ett ÅR (?per=2026) öppnar År-vyn; på fakturasidan blir det månaden (där finns bara månader)', () => {
    expect(lasUrl('?per=2026', NU)).toEqual({ sida: 'ar', period: null, ar: 2026 });
    expect(lasUrl('?flik=nu&per=2026', NU)).toEqual({ sida: 'ar', period: null, ar: 2026 });
    expect(lasUrl('?flik=fakturering&per=2026', NU)).toEqual({ sida: 'fakturering', period: null, ar: 2026 });
  });
  it('?ar=2026&per=2026-10 öppnar År-vyn och minns månaden man kom från', () => {
    expect(lasUrl('?ar=2026&per=2026-10', NU)).toEqual({ sida: 'ar', period: OKT, ar: 2026 });
    expect(lasUrl('?ar=1999&per=2026-10', NU)).toEqual({ sida: 'huvud', period: OKT, ar: null });   // före datan: som om det inte stod där
  });
  it('okänt eller ogiltigt = som om det inte stod där', () => {
    expect(lasUrl('?flik=karta&per=imorgon', NU)).toEqual({ sida: 'huvud', period: null, ar: null });
    expect(lasUrl('', NU)).toEqual({ sida: 'huvud', period: null, ar: null });
  });
  it('skriver samma som läses (huvudsidan skriver bara per=, ingen flik)', () => {
    expect(skrivUrl('huvud', OKT)).toBe('?per=2026-10');
    expect(skrivUrl('fakturering', OKT)).toBe('?flik=fakturering&per=2026-10');
    expect(skrivUrl('ar', OKT, 2026)).toBe('?ar=2026&per=2026-10');
    expect(lasUrl(skrivUrl('fakturering', OKT), NU)).toEqual({ sida: 'fakturering', period: OKT, ar: null });
    expect(lasUrl(skrivUrl('ar', OKT, 2026), NU)).toEqual({ sida: 'ar', period: OKT, ar: 2026 });
  });
});
