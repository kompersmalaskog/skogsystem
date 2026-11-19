// Symbolerna på kartan står alltid RAKA mot skärmen (Martin 2026-11-19, Elefanten): 'map' lade dem på sniskan i 3D-lutningen och snurrade dem
// med kartan, så utropstecknet i Varning låg på sidan. Källvakt — själva MapLibre-beteendet är kartans eget.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const page = readFileSync('app/planering/page.tsx', 'utf8');

describe('markers-layer: raka symboler', () => {
  it("pitch och rotation är 'viewport' också i körvyn", () => {
    expect(page).toContain("const align = 'viewport';");
    expect(page).not.toMatch(/const align = korvyActive \? 'map'/);
  });
  it('maskinens position blir orange (inte gul) när positionen är osäker, också för maskin-GPS', () => {
    expect(page).toContain('noggrannhetM: testlage ? null : gpsAccuracy');
  });
});
