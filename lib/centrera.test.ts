import { describe, it, expect } from 'vitest';
import { arKartanPaPositionen, centreraKnappSynlig, CENTRERA_PX } from './centrera';

// Fejk-karta: linjär projektion, 1 grad = 100 000 px (så 0,0001° = 10 px). Mitten = getCenter().
function karta(lng: number, lat: number) {
  const proj = (l: [number, number]) => ({ x: (l[0] - 15) * 100000, y: -(l[1] - 56) * 100000 });
  return { getCenter: () => ({ lng, lat }), project: proj };
}

describe('arKartanPaPositionen', () => {
  const pos = { lat: 56.3573, lon: 15.048 };

  it('kartan centrerad på positionen → true', () => {
    expect(arKartanPaPositionen(karta(15.048, 56.3573), pos)).toBe(true);
  });

  it('inom CENTRERA_PX (48 px) räknas som "på positionen"; strax utanför gör det inte', () => {
    expect(CENTRERA_PX).toBe(48);
    // 0,0004° = 40 px → på; 0,0006° = 60 px → bort
    expect(arKartanPaPositionen(karta(15.048 + 0.0004, 56.3573), pos)).toBe(true);
    expect(arKartanPaPositionen(karta(15.048 + 0.0006, 56.3573), pos)).toBe(false);
    expect(arKartanPaPositionen(karta(15.048, 56.3573 - 0.0006), pos)).toBe(false);
  });

  it('avståndet räknas diagonalt (både x och y)', () => {
    // 0,0004° i x och 0,0004° i y = 56,6 px → utanför 48
    expect(arKartanPaPositionen(karta(15.048 + 0.0004, 56.3573 + 0.0004), pos)).toBe(false);
  });

  it('egen tröskel', () => {
    expect(arKartanPaPositionen(karta(15.048 + 0.0006, 56.3573), pos, 80)).toBe(true);
  });

  it('saknad karta/position eller trasig projektion → true (inget att centrera, knappen ska inte visas på gissning)', () => {
    expect(arKartanPaPositionen(null, pos)).toBe(true);
    expect(arKartanPaPositionen(karta(1, 2), null)).toBe(true);
    expect(arKartanPaPositionen({ getCenter: () => ({ lng: 1, lat: 2 }), project: () => ({ x: NaN, y: 0 }) }, pos)).toBe(true);
    expect(arKartanPaPositionen({ getCenter: () => { throw new Error('x'); }, project: () => ({ x: 0, y: 0 }) }, pos)).toBe(true);
  });
});

describe('centreraKnappSynlig — samma knapp, två regler', () => {
  const bas = { korvy: false, harPosition: true, foljningPausad: false, kartaFranPosition: false };

  it('KÖRVYN: dold så länge kartan följer maskinen', () => {
    expect(centreraKnappSynlig({ ...bas, korvy: true })).toBe(false);
  });
  it('KÖRVYN: synlig när föraren dragit (följningen pausad), oavsett planeringens flagga', () => {
    expect(centreraKnappSynlig({ ...bas, korvy: true, foljningPausad: true })).toBe(true);
    expect(centreraKnappSynlig({ ...bas, korvy: true, foljningPausad: true, kartaFranPosition: false })).toBe(true);
  });
  it('KÖRVYN: planeringens "kartan bort från positionen" gör inget (körvyn styrs bara av pausen)', () => {
    expect(centreraKnappSynlig({ ...bas, korvy: true, kartaFranPosition: true })).toBe(false);
  });

  it('PLANERINGEN: dold när kartan står på positionen', () => {
    expect(centreraKnappSynlig({ ...bas })).toBe(false);
  });
  it('PLANERINGEN: synlig när kartan dragits bort', () => {
    expect(centreraKnappSynlig({ ...bas, kartaFranPosition: true })).toBe(true);
  });
  it('PLANERINGEN: körvyns paus-flagga gör inget', () => {
    expect(centreraKnappSynlig({ ...bas, foljningPausad: true })).toBe(false);
  });

  it('utan position: dold i båda vyerna', () => {
    expect(centreraKnappSynlig({ ...bas, harPosition: false, kartaFranPosition: true })).toBe(false);
    expect(centreraKnappSynlig({ ...bas, korvy: true, harPosition: false, foljningPausad: true })).toBe(false);
  });
});
