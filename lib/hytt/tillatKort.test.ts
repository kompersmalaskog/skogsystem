// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lasTillatKortLage, markeraTillatKortVisat, skaVisaTillatKort, tillatKortVisat, TILLAT_RUBRIK } from './tillatKort';

const bas = { aktiv: true, stods: true, behorighet: 'default' as const, visatForut: false };

describe('"Tillåt notiser"-kortet — en gång, bara när Chrome inte frågat', () => {
  it('visas i maskinläget med notiserna på när Chrome står på "default" och kortet inte visats förut', () => {
    expect(skaVisaTillatKort(bas)).toBe(true);
  });
  it('aldrig när notiserna redan är tillåtna eller blockerade (kortet kan inte ändra blockerat – Inställningar säger var man gör det)', () => {
    expect(skaVisaTillatKort({ ...bas, behorighet: 'granted' })).toBe(false);
    expect(skaVisaTillatKort({ ...bas, behorighet: 'denied' })).toBe(false);
    expect(skaVisaTillatKort({ ...bas, behorighet: 'saknas' })).toBe(false);
  });
  it('aldrig utanför maskinläget / med notiserna avstängda, eller i en webbläsare som inte klarar notiser', () => {
    expect(skaVisaTillatKort({ ...bas, aktiv: false })).toBe(false);
    expect(skaVisaTillatKort({ ...bas, stods: false })).toBe(false);
  });
  it('sen aldrig mer: efter ett tryck är kortet markerat som visat, även om Chrome fortfarande står på "default"', () => {
    expect(skaVisaTillatKort({ ...bas, visatForut: true })).toBe(false);
  });
  it('texten är den beställda', () => {
    expect(TILLAT_RUBRIK).toBe('Tillåt notiser så ser du besök och fara när Opti ligger framme');
  });

  describe('läget ur webbläsaren', () => {
    beforeEach(() => {
      localStorage.clear();
      const N: any = function () { /* */ }; N.permission = 'default';
      (globalThis as any).Notification = N; (window as any).Notification = N;
      Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
    });
    afterEach(() => { delete (globalThis as any).Notification; delete (window as any).Notification; });
    it('första starten visas kortet; efter markeringen aldrig igen (enhetens minne)', () => {
      expect(lasTillatKortLage(true)).toBe(true);
      markeraTillatKortVisat();
      expect(tillatKortVisat()).toBe(true);
      expect(lasTillatKortLage(true)).toBe(false);
    });
  });
});
