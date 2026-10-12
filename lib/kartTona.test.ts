import { describe, it, expect } from 'vitest';
import { tonaInLager, TRAKTGRANS_LAGER } from './kartTona';

function fejk(finns: string[]) {
  const anrop: [string, string, unknown][] = [];
  return {
    anrop,
    getLayer: (id: string) => (finns.includes(id) ? {} : undefined),
    setPaintProperty: (id: string, prop: string, v: unknown) => { anrop.push([id, prop, v]); },
  };
}

describe('tonaInLager', () => {
  it('sätter först opacitet 0 utan övergång, och först i nästa tick övergång + slutvärde', () => {
    const m = fejk(['trakt-gr-line', 'trakt-gr-fill']);
    let kor: (() => void) | null = null;
    const n = tonaInLager(m, [
      { id: 'trakt-gr-line', prop: 'line-opacity', till: 1 },
      { id: 'trakt-gr-fill', prop: 'fill-opacity', till: 0.05 },
    ], 700, (f) => { kor = f; });
    expect(n).toBe(2);
    // före schemaläggaren kört: bara nollställning
    expect(m.anrop).toEqual([
      ['trakt-gr-line', 'line-opacity-transition', { duration: 0, delay: 0 }],
      ['trakt-gr-line', 'line-opacity', 0],
      ['trakt-gr-fill', 'fill-opacity-transition', { duration: 0, delay: 0 }],
      ['trakt-gr-fill', 'fill-opacity', 0],
    ]);
    m.anrop.length = 0;
    kor!();
    expect(m.anrop).toEqual([
      ['trakt-gr-line', 'line-opacity-transition', { duration: 700, delay: 0 }],
      ['trakt-gr-line', 'line-opacity', 1],
      ['trakt-gr-fill', 'fill-opacity-transition', { duration: 700, delay: 0 }],
      ['trakt-gr-fill', 'fill-opacity', 0.05],
    ]);
  });

  it('lager som saknas på kartan hoppas över; inga lager alls → 0 och ingen schemaläggning', () => {
    const m = fejk(['trakt-gr-line']);
    let schemalagd = false;
    expect(tonaInLager(m, TRAKTGRANS_LAGER, 700, () => { schemalagd = true; })).toBe(1);
    expect(schemalagd).toBe(true);
    const tom = fejk([]);
    schemalagd = false;
    expect(tonaInLager(tom, TRAKTGRANS_LAGER, 700, () => { schemalagd = true; })).toBe(0);
    expect(schemalagd).toBe(false);
    expect(tom.anrop).toEqual([]);
  });

  it('ett lager som kastar vid målning tar inte med sig de andra', () => {
    const anrop: string[] = [];
    const m = {
      getLayer: () => ({}),
      setPaintProperty: (id: string, prop: string) => { if (id === 'a') throw new Error('stil'); anrop.push(id + ':' + prop); },
    };
    expect(tonaInLager(m, [{ id: 'a', prop: 'line-opacity', till: 1 }, { id: 'b', prop: 'line-opacity', till: 1 }], 700, (f) => f())).toBe(1);
    expect(anrop).toContain('b:line-opacity');
  });

  it('traktgränsens slutvärden är lagrens egna (fyllningen 0,05 — resten 1)', () => {
    expect(TRAKTGRANS_LAGER.find((l) => l.id === 'trakt-gr-fill')!.till).toBe(0.05);
    expect(TRAKTGRANS_LAGER.filter((l) => l.prop === 'line-opacity').every((l) => l.till === 1)).toBe(true);
  });
});
