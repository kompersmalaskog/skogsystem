import { describe, expect, it } from 'vitest';
import { delaIRutor, RUTA_MAX_PX } from './flygfoto';

describe('flygfotot hämtas i rutor', () => {
  const ruta: [number, number, number, number] = [1000, 2000, 2000, 3300];
  const rutor = delaIRutor(ruta, 998, 1297);

  it('ingen ruta är större än 512 px och de täcker hela bilden utan glapp', () => {
    expect(rutor).toHaveLength(2 * 3);
    for (const r of rutor) { expect(r.b).toBeLessThanOrEqual(RUTA_MAX_PX); expect(r.h).toBeLessThanOrEqual(RUTA_MAX_PX); }
    expect(rutor.reduce((s, r) => s + r.b * r.h, 0)).toBe(998 * 1297);
  });

  it('varje ruta har exakt sin del av kartan — norra raden överst', () => {
    const forsta = rutor[0], sista = rutor[rutor.length - 1];
    expect(forsta.bbox[0]).toBe(1000); expect(forsta.bbox[3]).toBe(3300);   // nordväst
    expect(sista.bbox[2]).toBe(2000); expect(sista.bbox[1]).toBe(2000);     // sydost
    // Grannar delar kant: ingen söm och inget överlapp.
    expect(rutor[0].bbox[2]).toBeCloseTo(rutor[1].bbox[0], 9);
    expect(rutor[0].bbox[1]).toBeCloseTo(rutor[2].bbox[3], 9);
    // Skalan är densamma i alla rutor (meter per pixel).
    for (const r of rutor) expect((r.bbox[2] - r.bbox[0]) / r.b).toBeCloseTo(1000 / 998, 9);
  });
});
