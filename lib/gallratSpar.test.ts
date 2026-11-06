import { describe, it, expect } from 'vitest';
import { arGallring, bandBredd, GALLRAT_BREDD_M } from './gallratSpar';

describe('gallrat band', () => {
  it('bredden i px motsvarar 20 m på marken (z 16, lat 56 ≈ 30 px)', () => {
    const b = bandBredd(GALLRAT_BREDD_M, 56);
    const [z0, p0, z1, p1] = [b[3], b[4], b[5], b[6]] as number[];
    const vid16 = p0 * 2 ** (16 - z0);
    expect(vid16).toBeGreaterThan(28); expect(vid16).toBeLessThan(32);
    expect(Math.abs(p1 / p0 / 2 ** (z1 - z0) - 1)).toBeLessThan(0.01);
  });
  it('bara gallring', () => {
    expect(arGallring({ typ: 'gallring' })).toBe(true);
    expect(arGallring({ typ: 'slutavverkning' })).toBe(false);
    expect(arGallring(null)).toBe(false);
  });
});
