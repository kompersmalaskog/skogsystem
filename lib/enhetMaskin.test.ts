import { describe, it, expect, beforeEach } from 'vitest';
import { hamtaEnhetMaskin, sattEnhetMaskin, hyttsparMaskinId, ENHET_MASKIN_KEY } from './enhetMaskin';

// Minimal localStorage-mock (jsdom finns inte i den här testmiljön).
function mockLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  return store;
}

describe('hamtaEnhetMaskin / sattEnhetMaskin', () => {
  beforeEach(() => { mockLocalStorage(); });

  it('spara → läs tillbaka', () => {
    sattEnhetMaskin('A130743');
    expect(hamtaEnhetMaskin()).toBe('A130743');
  });

  it('null/tomt rensar bindningen', () => {
    sattEnhetMaskin('A130743');
    sattEnhetMaskin(null);
    expect(hamtaEnhetMaskin()).toBeNull();
    sattEnhetMaskin('   ');
    expect(hamtaEnhetMaskin()).toBeNull();
  });

  it('osatt → null', () => {
    expect(hamtaEnhetMaskin()).toBeNull();
    expect(localStorage.getItem(ENHET_MASKIN_KEY)).toBeNull();
  });

  it('tål att localStorage kastar (privat läge / blockerat)', () => {
    (globalThis as any).localStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(() => sattEnhetMaskin('X')).not.toThrow();
    expect(hamtaEnhetMaskin()).toBeNull();
  });
});

describe('hyttsparMaskinId — spåret får rätt maskin', () => {
  it('enhetsvalet är auktoritativt (löser null-för-skotare-buggen)', () => {
    expect(hyttsparMaskinId('A130743', 'skotare', null)).toBe('A130743');
    expect(hyttsparMaskinId('A130743', 'skordare', 'R64101')).toBe('A130743'); // enhetsval slår objekt-maskin
  });

  it('utan enhetsval: gammalt beteende (skördarens objekt-maskin, skotare null)', () => {
    expect(hyttsparMaskinId(null, 'skordare', 'PONS20SDJAA270231')).toBe('PONS20SDJAA270231');
    expect(hyttsparMaskinId(null, 'skotare', null)).toBeNull();
    expect(hyttsparMaskinId('', 'skotare', 'A030353')).toBeNull(); // tomt enhetsval räknas inte
    expect(hyttsparMaskinId(null, 'skordare', null)).toBeNull();
  });
});
