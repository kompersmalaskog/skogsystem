import { describe, it, expect } from 'vitest';
import { LARMFRIA_SYMBOLER, FALLNING_SYMBOL, gruppForSymbol, larmRegelText, SYMBOL_NAMN } from './larm/grupper';
import { arAlltidPrick, arPrick } from './miljokrav';
import { MENY_KATEGORIER, GLYF } from './symboler';

// Odlingsröse (Martin 2026-11-01, fossil åker): många små rösen — liten brun prick, inget larm, men fällningscirkeln blir brun.
describe('Odlingsröse', () => {
  it('är Kultur, larmar aldrig, färgar fällningscirkeln brun', () => {
    expect(gruppForSymbol('odlingsrose')).toBe('kultur');
    expect(LARMFRIA_SYMBOLER).toContain('odlingsrose');
    expect(larmRegelText({ grupp: 'kultur', typ: 'odlingsrose' })).toBe('Larmar inte');
    expect(FALLNING_SYMBOL.odlingsrose).toBe('kultur');
  });
  it('ritas som prick överallt, också i planeringen — högstubbe bara i körvyn', () => {
    expect(arAlltidPrick('odlingsrose')).toBe(true);
    expect(arPrick('odlingsrose')).toBe(true);
    expect(arAlltidPrick('highstump')).toBe(false);
  });
  it('finns i menyn under Kultur, med namn och egen glyf', () => {
    expect(MENY_KATEGORIER.find((k) => k.namn === 'Kultur')?.symboler).toContain('odlingsrose');
    expect(SYMBOL_NAMN.odlingsrose).toBe('Odlingsröse');
    expect(GLYF.odlingsrose).toBeTruthy();
  });
});
