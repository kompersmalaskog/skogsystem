import { describe, it, expect } from 'vitest';
import { hogTradslagFarger, HOG_TRADSLAG_FARG, KARTA_BLANDAT } from './tradslag';
import { FARG_NATUR } from './larm/grupper';

describe('hogTradslagFarger — högarna i hela färger (bild K)', () => {
  it('ett trädslag över 70 % = en färg', () => {
    expect(hogTradslagFarger({ GRAN: 9, TALL: 1 })).toEqual({ farg: HOG_TRADSLAG_FARG.GRAN, farg2: null });
    expect(hogTradslagFarger({ TALL: 8 })).toEqual({ farg: HOG_TRADSLAG_FARG.TALL, farg2: null });
  });
  it('blandat = de två största, halv–halv', () => {
    expect(hogTradslagFarger({ GRAN: 5, TALL: 4, 'BJÖRK': 1 })).toEqual({ farg: HOG_TRADSLAG_FARG.GRAN, farg2: HOG_TRADSLAG_FARG.TALL });
    expect(hogTradslagFarger({ 'BJÖRK': 6, GRAN: 4 })).toEqual({ farg: HOG_TRADSLAG_FARG['BJÖRK'], farg2: HOG_TRADSLAG_FARG.GRAN });
  });
  it('okänt trädslag gissas aldrig', () => {
    expect(hogTradslagFarger({})).toEqual({ farg: KARTA_BLANDAT, farg2: null });
    expect(hogTradslagFarger({ OKÄNT: 5, GRAN: 4 })).toEqual({ farg: KARTA_BLANDAT, farg2: null });
    expect(hogTradslagFarger({ OKÄNT: 9, GRAN: 1 })).toEqual({ farg: KARTA_BLANDAT, farg2: null });
  });
  it('granen är inte Natur-gruppens gröna', () => {
    expect(HOG_TRADSLAG_FARG.GRAN.toLowerCase()).not.toBe(String(FARG_NATUR).toLowerCase());
  });
});
