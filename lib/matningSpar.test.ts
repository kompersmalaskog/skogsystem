import { describe, it, expect } from 'vitest';
import { hamtaMatning, sparaMatning, kastaMatning, tolkaMatning, matningLagringsnyckel, type SparadMatning } from './matningSpar';

const lagring = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, _m: m };
};

const strackan: SparadMatning = { typ: 'strackan', yta: false, punkter: [[15.05, 56.35], [15.051, 56.35]], meter: 62, areaM2: null, tid: 1 };
const yta: SparadMatning = { typ: 'yta', yta: true, punkter: [[15.05, 56.35], [15.051, 56.35], [15.051, 56.351]], meter: 0, areaM2: 3100, tid: 2 };

describe('sparad mätning — per objekt, enhetslokalt', () => {
  it('spara → läs tillbaka oförändrad; olika objekt har egna mätningar', () => {
    const l = lagring();
    expect(sparaMatning('obj-1', strackan, l)).toBe(true);
    expect(sparaMatning('obj-2', yta, l)).toBe(true);
    expect(hamtaMatning('obj-1', l)).toEqual(strackan);
    expect(hamtaMatning('obj-2', l)).toEqual(yta);
    expect(hamtaMatning('obj-3', l)).toBeNull();
    expect(matningLagringsnyckel('obj-1')).not.toBe(matningLagringsnyckel('obj-2'));
  });
  it('en ny sparning ersätter den förra (en mätning per objekt)', () => {
    const l = lagring();
    sparaMatning('o', strackan, l); sparaMatning('o', yta, l);
    expect(hamtaMatning('o', l)).toEqual(yta);
  });
  it('kasta tar bort den', () => {
    const l = lagring();
    sparaMatning('o', strackan, l);
    kastaMatning('o', l);
    expect(hamtaMatning('o', l)).toBeNull();
    expect(l._m.size).toBe(0);
  });
  it('trasig/skadad lagring ger null — aldrig ett fel eller en halv mätning', () => {
    for (const raw of ['{', 'null', '42', '{"typ":"hej"}', '{"typ":"strackan","punkter":[[1,2]]}', '{"typ":"strackan","punkter":[[1,"x"],[2,3]]}',
      '{"typ":"yta","yta":true,"punkter":[[1,2],[3,4]]}']) {
      expect(tolkaMatning(raw)).toBeNull();
    }
  });
  it('blockerad lagring: spar → false (visas aldrig som lyckat), läs → null, kasta kastar inte', () => {
    const blockerad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(sparaMatning('o', strackan, blockerad)).toBe(false);
    expect(hamtaMatning('o', blockerad)).toBeNull();
    expect(() => kastaMatning('o', blockerad)).not.toThrow();
  });
  it('objekt saknas → inget sparas', () => {
    const l = lagring();
    expect(sparaMatning(null, strackan, l)).toBe(false);
    expect(hamtaMatning(undefined, l)).toBeNull();
    expect(l._m.size).toBe(0);
  });
});
