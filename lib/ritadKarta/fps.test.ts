import { describe, expect, it } from 'vitest';
import { fpsOrd, matFps } from './fps';

describe('mätaren', () => {
  it('60 bilder på en sekund = 60 bilder/s, mjukt', () => {
    const t = Array.from({ length: 61 }, (_, i) => 1000 + i * (1000 / 60));
    const m = matFps(t, 2000);
    expect(m?.fps).toBe(60);
    expect(fpsOrd(m)).toContain('mjukt');
  });
  it('en lång paus syns som långsammast, och få bilder hackar', () => {
    const m = matFps([1000, 1100, 1400, 1500, 1900], 1950);
    expect(m?.langsammastMs).toBe(400);
    expect(fpsOrd(m)).toContain('hackar');
  });
  it('gamla bilder räknas inte; inga bilder = står still', () => {
    expect(matFps([0, 10, 20], 5000)).toBeNull();
    expect(fpsOrd(null)).toContain('Står still');
  });
});
