import { describe, it, expect } from 'vitest';
import {
  dampatSpar, sparAlder, sparBlekning, SPAR_DAMPAD_FARG, SPAR_BLEKNA_DAGAR, SPAR_KANT_FARG,
  sparStil, rollFarg, ROLLFARG_SKORDARE, ROLLFARG_SKOTARE, HYTTSPAR_LINE_WIDTH, HYTTSPAR_CASING_WIDTH, HYTTSPAR_HIST_LINE_WIDTH, HYTTSPAR_HIST_CASING_WIDTH,
  SKORDARSPAR_LINJE_BREDD, SKORDARSPAR_LINJE_OPACITET, SKORDARSPAR_CASING_BREDD, SKORDARSPAR_CASING_OPACITET, type SparArt,
} from './sparStil';
import { VAG_KANT_FARG } from './kartstil';

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

// ── Tydligare spår på planeringskartan (Martin 2026-10-27, efter de dämpade 2026-10-26) ────────────────────────────────────────────────────────────
describe('spåren på planeringskartan: rollfärger, 3 / 2,5 px, dagens ~0,9, smal mörk kant, äldre dagar bleknar med högt golv', () => {
  const ARTER2: SparArt[] = ['egen', 'hist', 'andras', 'plan'];
  const tal = (o: number | any[]) => (typeof o === 'number' ? [o] : [o[4], o[6]] as number[]);   // interpolate: stopp-värdena
  it('skördare 3 px och skotare 2,5 px i alla lager', () => {
    for (const art of ARTER2) {
      expect(dampatSpar('skordare', art).bredd, `skördare ${art}`).toBe(3);
      expect(dampatSpar('skotare', art).bredd, `skotare ${art}`).toBe(2.5);
    }
  });
  it('rollfärgerna (ROLLFARG_*), samma i alla lager — inte de dämpade nyanserna', () => {
    for (const roll of ['skordare', 'skotare'] as const) {
      const farger = new Set(ARTER2.map((art) => dampatSpar(roll, art).farg));
      expect(farger.size).toBe(1);
      expect([...farger][0]).toBe(roll === 'skordare' ? ROLLFARG_SKORDARE : ROLLFARG_SKOTARE);
      expect([...farger][0]).not.toBe(SPAR_DAMPAD_FARG[roll]);
    }
    expect(ROLLFARG_SKOTARE).toBe('#34c759'); expect(ROLLFARG_SKORDARE).toBe('#bf5af2');   // identitetsfärgerna är oförändrade
  });
  it('dagens spår ~0,9; äldre dagar bleknar men golvet är ~0,45 så en vecka gammalt spår fortfarande syns', () => {
    for (const roll of ['skordare', 'skotare'] as const) for (const art of ARTER2) {
      const o = dampatSpar(roll, art).opacitet;
      const [idag, aldst] = tal(o);
      expect(idag, `${roll} ${art} idag`).toBeGreaterThanOrEqual(0.85); expect(idag).toBeLessThanOrEqual(0.95);
      if (typeof o !== 'number') { expect(aldst, `${roll} ${art} golv`).toBeGreaterThanOrEqual(0.4); expect(aldst).toBeLessThanOrEqual(0.5); }
    }
    expect(dampatSpar('skordare', 'egen').opacitet).toBe(0.9);   // eget live-spår: alltid dagens värde
  });
  it('smal mörk kant under, som vägarna: samma färg som VAG_KANT_FARG, linjen + 2 px, något svagare än linjen', () => {
    expect(SPAR_KANT_FARG).toBe(VAG_KANT_FARG);
    for (const roll of ['skordare', 'skotare'] as const) for (const art of ARTER2) {
      const s = dampatSpar(roll, art);
      expect(s.kantFarg).toBe(VAG_KANT_FARG);
      expect(s.kantBredd).toBe(s.bredd + 2);
      const [lin] = tal(s.opacitet), [kant] = tal(s.kantOpacitet);
      expect(kant, `${roll} ${art}`).toBeGreaterThan(0);
      expect(kant).toBeLessThan(lin);
    }
  });
  it('skördarens spår är minst lika tydligt som skotarens', () => {
    for (const art of ARTER2) expect(Math.max(...tal(dampatSpar('skordare', art).opacitet))).toBeGreaterThanOrEqual(Math.max(...tal(dampatSpar('skotare', art).opacitet)));
  });
  it('tidigare dagar bleknar: planering, historik och den andres spår går från dagens värde ner till ett lägre efter 14 dagar (kanten likaså); eget live-spår är dagens', () => {
    for (const roll of ['skordare', 'skotare'] as const) for (const art of ['hist', 'plan', 'andras'] as const) {
      for (const o of [dampatSpar(roll, art).opacitet, dampatSpar(roll, art).kantOpacitet] as any[][]) {
        expect(o[0]).toBe('interpolate');
        expect(o[2]).toEqual(['coalesce', ['to-number', ['get', 'alder']], 0]);
        expect(o[3]).toBe(0); expect(o[5]).toBe(SPAR_BLEKNA_DAGAR);
        expect(o[6]).toBeLessThan(o[4]);   // äldst < idag
      }
    }
    expect(SPAR_BLEKNA_DAGAR).toBe(14);
    expect(sparBlekning(0.6, 0.2)).toEqual(['interpolate', ['linear'], ['coalesce', ['to-number', ['get', 'alder']], 0], 0, 0.6, 14, 0.2]);
  });
  it('sparAlder: dagar sedan, aldrig negativt; saknat eller trasigt datum är dagens (vi gissar inte att något är gammalt)', () => {
    expect(sparAlder('2026-10-26', '2026-10-26')).toBe(0);
    expect(sparAlder('2026-10-19', '2026-10-26')).toBe(7);
    expect(sparAlder('2026-09-26', '2026-10-26')).toBe(30);
    expect(sparAlder('2026-10-27', '2026-10-26')).toBe(0);
    expect(sparAlder(null, '2026-10-26')).toBe(0);
    expect(sparAlder('skräp', '2026-10-26')).toBe(0);
    expect(sparAlder('2026-10-19T08:00:00Z', '2026-10-26')).toBe(7);
  });
});
