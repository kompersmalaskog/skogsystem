import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SENASTE_OBJEKT_KEY, skrivSenasteObjekt, tolkaSenasteObjekt, hamtaSenasteObjekt, sattSenasteObjekt, rensaSenasteObjekt } from './senasteObjekt';

// Minimal localStorage (vitest kör i node)
function ls() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    _m: m,
  };
}

describe('tolka/skriv — minnet är knutet till maskinen', () => {
  it('rundtur', () => {
    const s = skrivSenasteObjekt('A130743', 'obj-1', 1234);
    expect(JSON.parse(s)).toEqual({ maskinId: 'A130743', objektId: 'obj-1', ts: 1234 });
    expect(tolkaSenasteObjekt(s, 'A130743')).toBe('obj-1');
  });
  it('en ANNAN maskins minne ärvs aldrig', () => {
    expect(tolkaSenasteObjekt(skrivSenasteObjekt('A130743', 'obj-1', 1), 'R64428')).toBeNull();
  });
  it('trasigt / tomt / fel form → null', () => {
    for (const raw of [null, undefined, '', '{', 'null', '[]', '{"maskinId":"A","objektId":""}', '{"maskinId":"A","objektId":5}', '{"objektId":"x"}']) {
      expect(tolkaSenasteObjekt(raw as any, 'A')).toBeNull();
    }
  });
});

describe('lagring (localStorage)', () => {
  let store: ReturnType<typeof ls>;
  beforeEach(() => { store = ls(); vi.stubGlobal('localStorage', store); });

  it('kom ihåg → hämta (samma maskin)', () => {
    expect(hamtaSenasteObjekt('A130743')).toBeNull();
    sattSenasteObjekt('A130743', 'obj-1');
    expect(hamtaSenasteObjekt('A130743')).toBe('obj-1');
  });

  it('föraren väljer ett annat objekt → det nya gäller', () => {
    sattSenasteObjekt('A130743', 'obj-1');
    sattSenasteObjekt('A130743', 'obj-2');
    expect(hamtaSenasteObjekt('A130743')).toBe('obj-2');
  });

  it('samma objekt igen → ingen onödig skrivning', () => {
    sattSenasteObjekt('A130743', 'obj-1');
    const spy = vi.spyOn(store, 'setItem');
    sattSenasteObjekt('A130743', 'obj-1');
    expect(spy).not.toHaveBeenCalled();
  });

  it('byter datorn maskin ärver den inte förra maskinens objekt', () => {
    sattSenasteObjekt('A130743', 'obj-1');
    expect(hamtaSenasteObjekt('R64428')).toBeNull();
  });

  it('objektet avslutas → rensa; "bara" rensar endast just det objektet', () => {
    sattSenasteObjekt('A130743', 'obj-1');
    rensaSenasteObjekt({ maskinId: 'A130743', objektId: 'obj-ANNAT' });
    expect(hamtaSenasteObjekt('A130743')).toBe('obj-1');      // annat objekt avslutades → minnet står kvar
    rensaSenasteObjekt({ maskinId: 'A130743', objektId: 'obj-1' });
    expect(hamtaSenasteObjekt('A130743')).toBeNull();
    expect(store._m.has(SENASTE_OBJEKT_KEY)).toBe(false);
  });

  it('utan maskin/objekt skrivs ingenting', () => {
    sattSenasteObjekt(null, 'obj-1');
    sattSenasteObjekt('A130743', null);
    sattSenasteObjekt('A130743', '');
    expect(store._m.size).toBe(0);
    expect(hamtaSenasteObjekt(null)).toBeNull();
  });
});

describe('blockerad localStorage → ingen krasch', () => {
  it('get/set/rensa kastar aldrig', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blockerad'); },
      setItem: () => { throw new Error('blockerad'); },
      removeItem: () => { throw new Error('blockerad'); },
    });
    expect(hamtaSenasteObjekt('A')).toBeNull();
    expect(() => sattSenasteObjekt('A', 'x')).not.toThrow();
    expect(() => rensaSenasteObjekt()).not.toThrow();
    expect(() => rensaSenasteObjekt({ maskinId: 'A', objektId: 'x' })).not.toThrow();
  });
});
