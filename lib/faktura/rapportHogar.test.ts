// Högarna på skotningsrapportens karta — APPENS högar, inte egenkontrollens
// röda stamprickar. Martin 2026-11-25: "inga röda högar dom ska vara som appen".
//
// Testet vaktar att färgen och storleken kommer ur appens egna källor
// (`klustraStammar`, `hogTradslagFarger`) och inte ur en egen tabell här.

import { describe, it, expect } from 'vitest';
import { rapportHogar, hogRadiePt, storstaHog, HOG_MIN_PT, HOG_MAX_PT } from './rapportHogar';
import { HOG_TRADSLAG_FARG, KARTA_BLANDAT } from '@/lib/tradslag';

const GRAN = HOG_TRADSLAG_FARG.GRAN, TALL = HOG_TRADSLAG_FARG.TALL, BJORK = HOG_TRADSLAG_FARG['BJÖRK'];

/** En stam på en plats, med volym och trädslag. */
const stam = (lat: number, lng: number, total_volym: number, tradslag: string) => ({ lat, lng, total_volym, tradslag });

describe('rapportHogar — appens färger', () => {
  it('en ren granhög får granens färg och ingen andra halva', () => {
    // Fem granar inom några meter → ett kluster.
    const h = rapportHogar(Array.from({ length: 5 }, (_, i) => stam(56.5 + i * 0.00001, 15.3, 0.5, 'GRAN')));
    expect(h).toHaveLength(1);
    expect(h[0].farg).toBe(GRAN);
    expect(h[0].farg2).toBeNull();
    expect(h[0].volym).toBeCloseTo(2.5, 5);
  });

  it('en blandad hög får de två största trädslagen halv–halv', () => {
    const h = rapportHogar([
      ...Array.from({ length: 3 }, (_, i) => stam(56.5 + i * 0.00001, 15.3, 1, 'GRAN')),
      ...Array.from({ length: 3 }, (_, i) => stam(56.5 + i * 0.00001, 15.30001, 1, 'TALL')),
    ]);
    expect(h).toHaveLength(1);
    expect([h[0].farg, h[0].farg2]).toEqual(expect.arrayContaining([GRAN, TALL]));
  });

  it('björk är björkens färg, okänt trädslag är blandat — aldrig en gissning', () => {
    const bjork = rapportHogar(Array.from({ length: 4 }, (_, i) => stam(56.5 + i * 0.00001, 15.3, 1, 'BJÖRK')));
    expect(bjork[0].farg).toBe(BJORK);
    const okant = rapportHogar(Array.from({ length: 4 }, (_, i) => stam(56.5 + i * 0.00001, 15.3, 1, '')));
    expect(okant[0].farg).toBe(KARTA_BLANDAT);
  });

  it('stammar utan position eller volym blir inga högar', () => {
    expect(rapportHogar([])).toEqual([]);
    expect(rapportHogar([stam(56.5, 15.3, 0, 'GRAN')])).toEqual([]);
  });

  it('INGEN hög är röd — röd är egenkontrollens stammoln och betyder fara i appen', () => {
    const h = rapportHogar([
      ...Array.from({ length: 4 }, (_, i) => stam(56.5 + i * 0.00001, 15.3, 1, 'GRAN')),
      ...Array.from({ length: 4 }, (_, i) => stam(56.502 + i * 0.00001, 15.3, 1, 'TALL')),
      ...Array.from({ length: 4 }, (_, i) => stam(56.504 + i * 0.00001, 15.3, 1, 'BJÖRK')),
    ]);
    for (const p of h) {
      expect(p.farg.toLowerCase()).not.toBe('#d32f2f');
      expect(p.farg2?.toLowerCase()).not.toBe('#d32f2f');
    }
  });
});

describe('hogRadiePt — storleken säger volym', () => {
  it('mer volym ger större hög, men aldrig under golvet eller över taket', () => {
    expect(hogRadiePt(0.01, 20)).toBeGreaterThanOrEqual(HOG_MIN_PT);
    expect(hogRadiePt(20, 20)).toBeCloseTo(HOG_MAX_PT, 5);
    expect(hogRadiePt(100, 20)).toBeLessThanOrEqual(HOG_MAX_PT);
    expect(hogRadiePt(10, 20)).toBeLessThan(hogRadiePt(20, 20));
  });

  it('skalan är kvadratrot — ytan, inte radien, följer volymen', () => {
    // Fyra gånger volymen ska ge dubbla radien (minus golvet).
    const liten = hogRadiePt(5, 20) - HOG_MIN_PT;
    const stor = hogRadiePt(20, 20) - HOG_MIN_PT;
    expect(stor / liten).toBeCloseTo(2, 1);
  });

  it('storstaHog på en tom lista ger 0 — och radien faller då till golvet, aldrig NaN', () => {
    expect(storstaHog([])).toBe(0);
    expect(hogRadiePt(5, storstaHog([]))).toBe(HOG_MIN_PT);
  });
});
