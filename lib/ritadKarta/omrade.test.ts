import { describe, expect, it } from 'vitest';
import { PUNKT_HALV_M, omradeNyckel, rutaRunt, valjOmrade } from './omrade';

const ring = (x: number) => [[x, 56], [x + 0.01, 56], [x + 0.01, 56.01], [x, 56]] as [number, number][];

describe('valjOmrade', () => {
  it('Vidas gräns går före allt', () => {
    expect(valjOmrade({ vida: [ring(15)], egna: [ring(16)], punkt: { lat: 57, lng: 14 } })).toEqual({ kalla: 'vida', ringar: [ring(15)] });
  });
  it('utan Vida: den egna gränsen', () => {
    expect(valjOmrade({ vida: null, egna: [ring(16)], punkt: { lat: 57, lng: 14 } })?.kalla).toBe('egen');
  });
  it('utan gräns: ruta runt punkten, 1 km', () => {
    const o = valjOmrade({ vida: [], egna: [], punkt: { lat: 57, lng: 14 } })!;
    expect(o.kalla).toBe('punkt');
    const [a, , c] = o.ringar[0];
    expect((c[1] - a[1]) * 111_320).toBeCloseTo(2 * PUNKT_HALV_M, 0);
  });
  it('ingenting (eller 0,0) → inget område, aldrig en gissad plats', () => {
    expect(valjOmrade({ vida: null, egna: null, punkt: null })).toBeNull();
    expect(valjOmrade({ vida: null, egna: null, punkt: { lat: 0, lng: 0 } })).toBeNull();
  });
  it('trasiga ringar räknas inte', () => {
    expect(valjOmrade({ vida: [[[1, 2]] as any], egna: [[[NaN, 1], [1, 1], [2, 2]] as any], punkt: null })).toBeNull();
  });
  it('rutan är sluten och nyckeln är stabil', () => {
    const r = rutaRunt(57, 14);
    expect(r[0]).toEqual(r[4]);
    const o = valjOmrade({ vida: null, egna: null, punkt: { lat: 57, lng: 14 } })!;
    expect(omradeNyckel(o)).toBe(omradeNyckel(valjOmrade({ vida: null, egna: null, punkt: { lat: 57.0000001, lng: 14 } })!));
  });
});
