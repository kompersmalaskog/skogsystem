// @vitest-environment jsdom
// Lugnare körvy: Klar dämpar en symbol — aldrig fara, kultur eller något med Viktigt. Sparas per maskin + objekt + symbol.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  KLAR_NYCKEL, KLAR_OPACITET, dampadOpacitet, dampbaraTyper, hamtaKlara, kanDampas, klarNyckel, odampbaraTyper, sparaKlara, tolkaKlara, vaxlaKlar,
} from './korvyKlar';
import { SYMBOL_GRUPP } from './larm/grupper';
import { NARA_GOLV } from './narStyrka';

describe('vad som går att dämpa', () => {
  it('faror går aldrig att dämpa', () => {
    for (const t of ['powerline', 'warning', 'steep', 'groundcable']) expect(kanDampas(t), t).toBe(false);
  });
  it('kultur går aldrig att dämpa (kulturlämning, kulturstubbe, odlingsröse)', () => {
    for (const t of ['culturemonument', 'culturestump', 'odlingsrose']) expect(kanDampas(t), t).toBe(false);
  });
  it('allt med Viktigt-rad går aldrig att dämpa, vilken typ det än är', () => {
    expect(kanDampas('landing', true)).toBe(false);
    expect(kanDampas('eternitytree', true)).toBe(false);
    expect(kanDampas('landing', false)).toBe(true);
  });
  it('natur, blött, att göra och info går att dämpa', () => {
    for (const t of ['eternitytree', 'naturecorner', 'highstump', 'wet', 'manualfelling', 'felloutside', 'gate', 'note', 'landing', 'firewood', 'brashpile', 'windfall', 'road', 'turningpoint', 'ditch', 'bridge', 'corduroy', 'trail', 'huntingtower']) {
      expect(kanDampas(t), t).toBe(true);
    }
  });
  it('en okänd typ räknas som Info (går att dämpa) — som larmen: aldrig ett påhittat skydd', () => {
    expect(kanDampas('nagot-nytt')).toBe(true);
    expect(kanDampas(null)).toBe(true);
  });
  it('listan över dämpbara och odämpbara täcker hela symbolregistret, utan överlapp', () => {
    const d = dampbaraTyper(); const o = odampbaraTyper();
    expect(d.filter((t) => o.includes(t))).toEqual([]);
    expect([...d, ...o].sort()).toEqual(Object.keys(SYMBOL_GRUPP).sort());
    expect(o).toEqual(['culturemonument', 'culturestump', 'groundcable', 'odlingsrose', 'powerline', 'steep', 'warning']);
  });
});

describe('lagring per maskin + objekt', () => {
  beforeEach(() => { localStorage.clear(); });
  it('nyckeln bär maskin och objekt; utan objekt ingen nyckel; okänd maskin delar nyckeln ingen', () => {
    expect(klarNyckel('R64428', 'obj-1')).toBe(`${KLAR_NYCKEL}:R64428:obj-1`);
    expect(klarNyckel(null, 'obj-1')).toBe(`${KLAR_NYCKEL}:ingen:obj-1`);
    expect(klarNyckel('R64428', null)).toBeNull();
  });
  it('sparat val finns kvar (nästa dag/omstart) och gäller bara den maskinen och det objektet', () => {
    sparaKlara('R64428', 'obj-1', new Set(['11', '12']));
    expect(Array.from(hamtaKlara('R64428', 'obj-1')).sort()).toEqual(['11', '12']);
    expect(hamtaKlara('R64428', 'obj-2').size).toBe(0);          // annat objekt: allt fullt
    expect(hamtaKlara('PONS20SDJAA270231', 'obj-1').size).toBe(0);  // annan maskin: allt fullt
  });
  it('tom mängd tar bort nyckeln', () => {
    sparaKlara('R64428', 'obj-1', new Set(['11']));
    sparaKlara('R64428', 'obj-1', new Set());
    expect(localStorage.getItem(klarNyckel('R64428', 'obj-1')!)).toBeNull();
  });
  it('trasigt värde ger allt fullt, aldrig ett kast', () => {
    localStorage.setItem(klarNyckel('R64428', 'obj-1')!, '{trasigt');
    expect(hamtaKlara('R64428', 'obj-1').size).toBe(0);
    expect(tolkaKlara('"en sträng"').size).toBe(0);
    expect(Array.from(tolkaKlara('[1, "a", null, {}]')).sort()).toEqual(['1', 'a']);
  });
  it('Klar → Visa igen växlar ett id och rör inga andra', () => {
    const a = vaxlaKlar(new Set(['1']), '2');
    expect(Array.from(a).sort()).toEqual(['1', '2']);
    expect(Array.from(vaxlaKlar(a, '2'))).toEqual(['1']);
  });
});

describe('opacitet', () => {
  const klara = new Set(['7']);
  const bas = { id: '7', typ: 'landing', klara, harViktigt: false, slaPa: true };
  it('dämpad symbol är halvgenomskinlig, lägre än avståndets golv', () => {
    expect(KLAR_OPACITET).toBeLessThan(NARA_GOLV);
    expect(dampadOpacitet(1, bas)).toBe(KLAR_OPACITET);
  });
  it('en symbol som inte är dämpad rörs inte (avståndets styrka gäller som förut)', () => {
    expect(dampadOpacitet(1, { ...bas, id: '8' })).toBe(1);
    expect(dampadOpacitet(0.6, { ...bas, id: '8' })).toBe(0.6);
  });
  it('en redan svag symbol (långt bort) blir aldrig starkare av att dämpas', () => {
    expect(dampadOpacitet(0.2, bas)).toBe(0.2);
  });
  it('sparat Klar på en fara eller kultur har ingen verkan', () => {
    for (const typ of ['powerline', 'warning', 'steep', 'culturemonument', 'odlingsrose']) expect(dampadOpacitet(1, { ...bas, typ }), typ).toBe(1);
  });
  it('sparat Klar på något som fått en Viktigt-rad har ingen verkan', () => {
    expect(dampadOpacitet(1, { ...bas, harViktigt: true })).toBe(1);
  });
  it('skotaren och planeringsvyn (slaPa=false) ser symbolen full trots att skördaren dämpat den', () => {
    expect(dampadOpacitet(1, { ...bas, slaPa: false })).toBe(1);
  });
});
