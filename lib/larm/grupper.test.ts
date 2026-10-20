import { describe, expect, it } from 'vitest';
import { markerIconDefs } from '../marker-icons';
import { FARG_KULTUR, GRUPPER, GRUPP_ORDNING, SYMBOL_GRUPP, YTA, VIDA, gruppForLinje, gruppForSymbol, symbolFarg, ytaDef } from './grupper';

/** Matlagets hue i grader, 0–360. */
function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('färggrupper', () => {
  it('sex grupper, i skissens ordning', () => {
    expect(GRUPP_ORDNING).toEqual(['fara', 'natur', 'kultur', 'blott', 'att_gora', 'info']);
  });
  it('larmreglerna: Röd alltid, Grön/Brun/Blå tills kvitterat, Lila och Mörk aldrig', () => {
    expect(GRUPPER.fara.larm).toBe('alltid');
    expect(['natur', 'kultur', 'blott'].map((g) => GRUPPER[g as 'natur'].larm)).toEqual(['tills_kvitterat', 'tills_kvitterat', 'tills_kvitterat']);
    expect(GRUPPER.att_gora.larm).toBe('aldrig');
    expect(GRUPPER.info.larm).toBe('aldrig');
  });
  it('Kultur är brun #B5651D, inte orange', () => {
    expect(GRUPPER.kultur.farg).toBe('#B5651D');
    expect(FARG_KULTUR).toBe('#B5651D');
  });
  it('ingen grupp är orange (orange betyder bara tall)', () => {
    for (const g of GRUPP_ORDNING) {
      const farg = GRUPPER[g].farg;
      if (g === 'kultur') continue;                                   // brun: mörk och dämpad, aldrig #ff9f0a / #f59e0b
      const h = hue(farg);
      expect(h >= 20 && h <= 50 && g !== 'info').toBe(false);
    }
    expect(['#ff9f0a', '#f59e0b', '#e8832a', '#ff9500']).not.toContain(GRUPPER.kultur.farg.toLowerCase());
  });
  it('varje färg är unik', () => {
    const f = GRUPP_ORDNING.map((g) => GRUPPER[g].farg);
    expect(new Set(f).size).toBe(f.length);
  });
  it('varje symbol i ikonregistret har en grupp', () => {
    for (const d of markerIconDefs) expect(Object.keys(SYMBOL_GRUPP), d.id).toContain(d.id);
  });
  it('symbolerna ligger i rätt grupp enligt beslutet', () => {
    const g = (t: string) => gruppForSymbol(t);
    expect(['powerline', 'warning', 'steep'].map(g)).toEqual(['fara', 'fara', 'fara']);
    expect(['eternitytree', 'highstump', 'naturecorner'].map(g)).toEqual(['natur', 'natur', 'natur']);
    expect(['culturemonument', 'culturestump'].map(g)).toEqual(['kultur', 'kultur']);
    expect(['wet'].map(g)).toEqual(['blott']);
    expect(['manualfelling', 'felloutside'].map(g)).toEqual(['att_gora', 'att_gora']);
    expect(['landing', 'firewood', 'brashpile', 'windfall', 'road', 'turningpoint', 'ditch', 'bridge', 'corduroy', 'trail'].map(g).every((x) => x === 'info')).toBe(true);
  });
  it('Manuell fällning är inte fara', () => {
    expect(gruppForSymbol('manualfelling')).not.toBe('fara');
    expect(symbolFarg('manualfelling')).not.toBe(GRUPPER.fara.farg);
  });
  it('okänd typ är Info, aldrig ett påhittat larm', () => {
    expect(gruppForSymbol('finns-inte')).toBe('info');
    expect(gruppForSymbol(undefined)).toBe('info');
  });
  it('Stenmur är Natur; övriga linjer är ingen grupp', () => {
    expect(gruppForLinje('stonewall')).toBe('natur');
    expect(gruppForLinje('mainRoad')).toBeNull();
    expect(gruppForLinje('boundary')).toBeNull();
  });
  it('ytorna: Hänsyn, Fornlämning, Ej framkomlig är förbjudna; Blött, Brant, Kulturmiljö följer sin grupp', () => {
    expect(['protected', 'fornlamning', 'noentry'].map((t) => YTA[t].forbjuden)).toEqual([true, true, true]);
    expect(['wet', 'steep', 'culture'].map((t) => YTA[t].forbjuden)).toEqual([false, false, false]);
    expect(YTA.steep.grupp).toBe('fara');
    expect(YTA.wet.grupp).toBe('blott');
    expect(YTA.culture.grupp).toBe('kultur');
    expect(ytaDef('gallring')).toBeNull();
  });
  it('Vidas lager: Hänsyn och Nyckelbiotop är förbjudna ytor, RAÄ-yta är Fornlämning, RAÄ-punkt är Kultur, Kraftledning är Röd', () => {
    expect(VIDA.hansynsyta).toMatchObject({ grupp: 'natur', forbjuden: true });
    expect(VIDA.nyckelbiotop).toMatchObject({ grupp: 'natur', forbjuden: true });
    expect(VIDA.raa_yta).toMatchObject({ grupp: 'kultur', forbjuden: true, namn: 'Fornlämning' });
    expect(VIDA.raa_punkt).toMatchObject({ grupp: 'kultur', forbjuden: false });
    expect(VIDA.kraftledning).toMatchObject({ grupp: 'fara' });
  });
});
