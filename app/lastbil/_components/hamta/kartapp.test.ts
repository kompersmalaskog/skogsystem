// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { arAppleEnhet, KARTAPP_NYCKEL, kanValjaKartapp, kartLank, lankAttr, lasKartapp, sparaKartapp, standardKartapp } from './kartapp';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';
const IPADOS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
const MAC = IPADOS;

describe('kartapp', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* ingen lagring */ } });

  it('Apple Kartor finns på iPhone, iPad (även som "Mac" med touch) men inte på Android eller en vanlig dator', () => {
    expect(arAppleEnhet(IPHONE)).toBe(true);
    expect(arAppleEnhet(IPADOS, 5)).toBe(true);
    expect(arAppleEnhet(MAC, 0)).toBe(false);
    expect(arAppleEnhet(ANDROID)).toBe(false);
  });

  it('standard: Apple Kartor på Apple-enheter, annars Google Maps', () => {
    expect(standardKartapp(IPHONE)).toBe('apple');
    expect(standardKartapp(ANDROID)).toBe('google');
  });

  it('djuplänkarna bär koordinaten med sex decimaler', () => {
    expect(kartLank('apple', 56.5, 14.72)).toBe('maps://?daddr=56.500000,14.720000&dirflg=d');
    expect(kartLank('google', 56.5, 14.72)).toBe('https://www.google.com/maps/dir/?api=1&destination=56.500000,14.720000&travelmode=driving');
  });

  it('webblänkar öppnas i ny flik, maps:// gör det inte', () => {
    expect(lankAttr(kartLank('google', 1, 2))).toMatchObject({ target: '_blank', rel: 'noopener noreferrer' });
    expect(lankAttr(kartLank('apple', 1, 2)).target).toBeUndefined();
  });

  it('valet sparas per enhet; i jsdom (ingen Apple-enhet) gäller alltid Google Maps, även om "apple" sparats', () => {
    sparaKartapp('apple');
    expect(localStorage.getItem(KARTAPP_NYCKEL)).toBe('apple');
    expect(lasKartapp()).toBe('google');
    expect(kanValjaKartapp()).toBe(false);
    sparaKartapp('google');
    expect(lasKartapp()).toBe('google');
  });

  describe('på en iPhone', () => {
    beforeEach(() => { vi.stubGlobal('navigator', { userAgent: IPHONE, maxTouchPoints: 5 }); });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('Apple Kartor är förvald och väljaren erbjuds', () => {
      expect(kanValjaKartapp()).toBe(true);
      expect(lasKartapp()).toBe('apple');
    });

    it('ett sparat val gäller nästa gång, i båda riktningarna', () => {
      sparaKartapp('google');
      expect(lasKartapp()).toBe('google');
      sparaKartapp('apple');
      expect(lasKartapp()).toBe('apple');
    });

    it('ett skräpvärde i lagringen ger standarden, inte ett fel', () => {
      localStorage.setItem(KARTAPP_NYCKEL, 'tomtom');
      expect(lasKartapp()).toBe('apple');
    });
  });
});
