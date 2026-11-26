import { describe, expect, it } from 'vitest';
import { stapelLayout, visaDatum } from './prodStaplar';

// Kortets innerbredd på en telefon 390 px: 390 − 2·24 − 2·16 = 310.
describe('stapelLayout', () => {
  it('okänd bredd = som förut', () => {
    expect(stapelLayout(0, 30)).toEqual({ gap: 8, visaSiffror: true, datumVarK: 1 });
  });
  it('få dagar: allt syns', () => {
    expect(stapelLayout(310, 6)).toEqual({ gap: 8, visaSiffror: true, datumVarK: 1 });
  });
  it('30 dagar på telefon: tät, inga siffror, glesa datum', () => {
    const l = stapelLayout(310, 30);
    expect(l.gap).toBe(2);
    expect(l.visaSiffror).toBe(false);
    expect(l.datumVarK).toBe(4);
  });
  it('kolumnerna ryms alltid i bredden', () => {
    for (const n of [1, 5, 11, 15, 30, 60]) for (const b of [250, 310, 600]) {
      const l = stapelLayout(b, n);
      const kol = (b - l.gap * (n - 1)) / n;
      expect(kol).toBeGreaterThan(0);
      // datumen krockar aldrig: avståndet mellan två visade datum ≥ 38 px
      expect(l.datumVarK * (kol + l.gap)).toBeGreaterThanOrEqual(38);
    }
  });
  it('visaDatum', () => {
    expect([0, 1, 2, 3, 4].map((i) => visaDatum(i, 2))).toEqual([true, false, true, false, true]);
  });
});
