import { describe, it, expect } from 'vitest';
import {
  sparStil, rollFarg, ROLLFARG_SKORDARE, ROLLFARG_SKOTARE, HYTTSPAR_LINE_WIDTH, HYTTSPAR_CASING_WIDTH, HYTTSPAR_HIST_LINE_WIDTH, HYTTSPAR_HIST_CASING_WIDTH,
  SKORDARSPAR_LINJE_BREDD, SKORDARSPAR_LINJE_OPACITET, SKORDARSPAR_CASING_BREDD, SKORDARSPAR_CASING_OPACITET, type SparArt,
} from './sparStil';

// SKÖRDARENS LINJE (Martin 2026-10-08): jämn bredd ~3 px, full färg, ALLA dagar — skotaren följer stråken. Skotarens linje oförändrad.
const ARTER: SparArt[] = ['egen', 'hist', 'andras', 'plan'];

describe('skördarens spår: jämn 3 px, full färg, i ALLA lager (eget, tidigare dagar, den andres, planering)', () => {
  it('bredd 3 px (ett tal — inte en zoom-interpolation), opacitet 1, lila', () => {
    for (const art of ARTER) {
      const s = sparStil('skordare', art);
      expect(s.linjeBredd).toBe(3);
      expect(s.linjeOpacitet).toBe(1);
      expect(s.farg).toBe('#bf5af2');
    }
    expect(SKORDARSPAR_LINJE_BREDD).toBe(3);
    expect(SKORDARSPAR_LINJE_OPACITET).toBe(1);
  });
  it('tidigare dagar är INTE smalare eller svagare än idag, och den andres spår tonas INTE ned (skotaren följer stråken)', () => {
    const idag = sparStil('skordare', 'egen'), hist = sparStil('skordare', 'hist'), andras = sparStil('skordare', 'andras'), plan = sparStil('skordare', 'plan');
    expect(hist).toEqual(idag); expect(andras).toEqual(idag); expect(plan).toEqual(idag);
  });
  it('ljus casing med jämn bredd (3 + 2,5 px) och samma opacitet i alla lager', () => {
    for (const art of ARTER) {
      const s = sparStil('skordare', art);
      expect(s.casingBredd).toBe(SKORDARSPAR_CASING_BREDD);
      expect(SKORDARSPAR_CASING_BREDD).toBeCloseTo(3 + 2.5, 5);
      expect(s.casingOpacitet).toBe(SKORDARSPAR_CASING_OPACITET);
    }
  });
});

describe('skotarens spår är OFÖRÄNDRAT (bredd per zoom, eget 0,95, historik smalare, den andres 0,55)', () => {
  it('eget och planering: zoom-bredd, 0,95; casing 0,8', () => {
    for (const art of ['egen', 'plan'] as SparArt[]) {
      const s = sparStil('skotare', art);
      expect(s.linjeBredd).toBe(HYTTSPAR_LINE_WIDTH); expect(s.linjeOpacitet).toBe(0.95);
      expect(s.casingBredd).toBe(HYTTSPAR_CASING_WIDTH); expect(s.casingOpacitet).toBe(0.8);
      expect(s.farg).toBe('#34c759');
    }
  });
  it('historik: smalare bredd, 0,95, dämpad casing 0,45', () => {
    const s = sparStil('skotare', 'hist');
    expect(s.linjeBredd).toBe(HYTTSPAR_HIST_LINE_WIDTH); expect(s.linjeOpacitet).toBe(0.95);
    expect(s.casingBredd).toBe(HYTTSPAR_HIST_CASING_WIDTH); expect(s.casingOpacitet).toBe(0.45);
  });
  it('den andres: dämpad 0,55 (casing 0,5)', () => {
    const s = sparStil('skotare', 'andras');
    expect(s.linjeBredd).toBe(HYTTSPAR_LINE_WIDTH); expect(s.linjeOpacitet).toBe(0.55);
    expect(s.casingBredd).toBe(HYTTSPAR_CASING_WIDTH); expect(s.casingOpacitet).toBe(0.5);
  });
  it('zoom-tabellerna är de som Martin satte (2 px @ z13, 4 px @ z15, 6 px @ z17)', () => {
    expect(HYTTSPAR_LINE_WIDTH).toEqual(['interpolate', ['linear'], ['zoom'], 11, 1.5, 13, 2, 15, 4, 17, 6, 19, 8]);
  });
});

describe('rollfärger är absoluta', () => {
  it('skotare grönt, skördare lila; okänd/null → skördare (som förut)', () => {
    expect(rollFarg('skotare')).toBe(ROLLFARG_SKOTARE);
    expect(rollFarg('skordare')).toBe(ROLLFARG_SKORDARE);
    expect(rollFarg(null)).toBe(ROLLFARG_SKORDARE);
    expect(ROLLFARG_SKOTARE).toBe('#34c759'); expect(ROLLFARG_SKORDARE).toBe('#bf5af2');
  });
});
