import { describe, it, expect } from 'vitest';
import { forenkla, hojdkurvor, jamna, kurvlinjer, skuggaFlera, HOJD_RUTA_M, KURVA_M, type Hojd } from './hojd';
import { slataKlasser } from './skog';

const plan = (bredd: number, hojd: number, f: (x: number, y: number) => number): Hojd => {
  const z = new Float32Array(bredd * hojd);
  for (let y = 0; y < hojd; y++) for (let x = 0; x < bredd; x++) z[y * bredd + x] = f(x, y);
  return { minX: 500000, maxY: 6300000, bredd, hojd, rutaM: HOJD_RUTA_M, z };
};

describe('skuggning från flera håll', () => {
  it('platt mark är neutral (128)', () => {
    const s = skuggaFlera(plan(10, 10, () => 100));
    expect([...s].every((v) => v === 128)).toBe(true);
  });
  it('sluttning mot nordväst är ljusare än mot sydost', () => {
    // Höjden ökar mot sydost (x ökar = öst, y ökar = syd) → marken lutar ned mot nordväst.
    const nv = skuggaFlera(plan(10, 10, (x, y) => (x + y) * 0.5));
    const so = skuggaFlera(plan(10, 10, (x, y) => -(x + y) * 0.5));
    expect(nv[55]).toBeGreaterThan(128);
    expect(so[55]).toBeLessThan(128);
  });
  it('sluttning mot nordost syns också (inte platt som med en enda sol från nordväst)', () => {
    const no = skuggaFlera(plan(10, 10, (x, y) => (-x + y) * 0.5)); // ned mot nordost
    expect(Math.abs(no[55] - 128)).toBeGreaterThan(3);
  });
  it('rutor utan data blir neutrala', () => {
    const h = plan(5, 5, () => 10); h.z[12] = NaN;
    expect(skuggaFlera(h)[12]).toBe(128);
  });
});

describe('höjdkurvor', () => {
  it('en kulle ger slutna ringar, en per nivå, stödkurva var 25:e meter', () => {
    const h = plan(120, 120, (x, y) => 100 + 30 * Math.exp(-((x - 60) ** 2 + (y - 60) ** 2) / 800));
    const fc = hojdkurvor(h);
    const nivaer = [...new Set(fc.features.map((f) => (f.properties as any).z))].sort((a, b) => a - b);
    expect(nivaer[0] % KURVA_M).toBe(0);
    expect(nivaer.length).toBeGreaterThanOrEqual(5);
    for (const f of fc.features) {
      const k = (f.geometry as GeoJSON.LineString).coordinates;
      expect(k[0]).toEqual(k[k.length - 1]); // sluten ring runt kullen
      expect((f.properties as any).s).toBe((f.properties as any).z % 25 === 0 ? 1 : 0);
    }
    expect(fc.features.filter((f) => (f.properties as any).z === 115)).toHaveLength(1);
  });
  it('platt mark ger inga kurvor, inte heller ett hål i datan', () => {
    const h = plan(50, 50, () => 100); h.z[100] = NaN;
    expect(hojdkurvor(h).features).toHaveLength(0);
  });
  it('en jämn backe ger raka kurvor, avståndet följer lutningen (täta = brant)', () => {
    const flack = kurvlinjer(plan(40, 40, (x) => x * 0.1).z, 40, 40, 2);
    expect(flack).toHaveLength(1);
    const brant = hojdkurvor(plan(100, 100, (x) => x * 2));   // 1 m/m
    const flackFc = hojdkurvor(plan(100, 100, (x) => x * 0.2)); // 0,1 m/m
    expect(brant.features.length).toBeGreaterThan(flackFc.features.length * 5);
  });
  it('korta kurvor (en sten) ritas inte', () => {
    const h = plan(100, 100, (x, y) => 100 + (Math.hypot(x - 50, y - 50) < 2 ? 6 : 0));
    expect(hojdkurvor(h).features).toHaveLength(0);
  });
  it('förenklingen behåller ändpunkterna och tar bort punkter på en rak linje', () => {
    expect(forenkla([[0, 0], [1, 0.01], [2, 0], [3, 0]], 0.5)).toEqual([[0, 0], [3, 0]]);
  });
  it('utjämningen sprider inte en lucka', () => {
    const z = new Float32Array([1, 1, 1, NaN, 1, 1]);
    const j = jamna(z, 6, 1, 1);
    expect(Number.isNaN(j[3])).toBe(true);
    expect(j[0]).toBeCloseTo(1);
  });
});

describe('små fläckar i skogen tar grannarnas klass', () => {
  it('en ensam ruta mitt i mogen skog blir mogen, en stor fläck står kvar, fasta klasser rörs aldrig', () => {
    const b = 20, h = 20;
    const kl = new Uint8Array(b * h).fill(4);       // mogen
    kl[5 * b + 5] = 2;                               // en ruta ungskog
    for (let y = 10; y < 15; y++) for (let x = 10; x < 15; x++) kl[y * b + x] = 3; // 25 rutor gallringsskog
    kl[1 * b + 1] = 5;                               // avverkat (fast)
    kl[2 * b + 2] = 0;                               // ingen data (fast)
    slataKlasser(kl, b, h, 10, [0, 5]);
    expect(kl[5 * b + 5]).toBe(4);
    expect(kl[12 * b + 12]).toBe(3);
    expect(kl[1 * b + 1]).toBe(5);
    expect(kl[2 * b + 2]).toBe(0);
  });
});
