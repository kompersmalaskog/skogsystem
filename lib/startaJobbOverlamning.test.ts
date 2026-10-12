import { describe, it, expect } from 'vitest';
import { skrivOverlamning, lasBesked, AUTORELOAD_NYCKEL, BESKED_NYCKEL, BESKED_MAX_MS } from './startaJobbOverlamning';

const lager = () => { const m = new Map<string, string>(); return { m, setItem: (k: string, v: string) => { m.set(k, v); }, getItem: (k: string) => m.get(k) ?? null, removeItem: (k: string) => { m.delete(k); } }; };

describe('överlämning till körvyn', () => {
  it('skriver exakt den form planeringssidans pendingRestore läser (objektId, korvyActive, korvyForceRoll, ts)', () => {
    const s = lager();
    expect(skrivOverlamning(s, { objektId: 'o1', roll: 'skotare', besked: 'P-1018 — knappa in', nu: 1000 })).toBe(true);
    expect(JSON.parse(s.m.get(AUTORELOAD_NYCKEL)!)).toEqual({ objektId: 'o1', korvyActive: true, korvyForceRoll: 'skotare', ts: 1000 });
    expect(JSON.parse(s.m.get(BESKED_NYCKEL)!)).toEqual({ text: 'P-1018 — knappa in', ts: 1000 });
  });
  it('utan besked skrivs inget besked', () => {
    const s = lager();
    skrivOverlamning(s, { objektId: 'o1', roll: 'skordare', nu: 5 });
    expect(s.m.has(BESKED_NYCKEL)).toBe(false);
  });
  it('blockerad lagring → false, aldrig ett kast', () => {
    const trasig = { setItem: () => { throw new Error('QuotaExceeded'); } };
    expect(skrivOverlamning(trasig, { objektId: 'o1', roll: 'skordare' })).toBe(false);
  });
  it('beskedet läses EN gång (rensas) och bara om det är färskt', () => {
    const s = lager();
    skrivOverlamning(s, { objektId: 'o1', roll: 'skordare', besked: 'hej', nu: 1000 });
    expect(lasBesked(s, 1000 + 5000)).toBe('hej');
    expect(lasBesked(s, 1000 + 5000)).toBeNull();
    skrivOverlamning(s, { objektId: 'o1', roll: 'skordare', besked: 'gammalt', nu: 1000 });
    expect(lasBesked(s, 1000 + BESKED_MAX_MS + 1)).toBeNull();
  });
  it('trasig JSON och tomt besked ger null', () => {
    const s = lager();
    s.setItem(BESKED_NYCKEL, '{trasig');
    expect(lasBesked(s)).toBeNull();
    s.setItem(BESKED_NYCKEL, JSON.stringify({ text: '  ', ts: Date.now() }));
    expect(lasBesked(s)).toBeNull();
  });
});
