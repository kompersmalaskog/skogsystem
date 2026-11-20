// Apteringen bedöms på MASKINENS egna kap (Martin 2026-10-21): förarens kortningar vid
// fel på trädet är rätt aptering. Talet, längderna och meningen räknas bara på "Automatic".
import { describe, it, expect } from "vitest";
import { byggObjektVy } from "./vy";
import type { HprLog, HprProduct } from "./hpr-parser";

const produkt: HprProduct = {
  productKey: "P1", name: "Timmer", group: "Timmer", speciesGroupKey: null, classified: true,
  diaClassCategory: "Top", diameterUnderBark: false, diaLimits: [200], diaMax: null,
  lenLimits: [400, 500], lenMax: null, distributionAllowed: true, distributionCategory: "Volume of logs",
  maxDeviation: 4, cells: [
    { diaLower: 200, lenLower: 400, distribution: 50 },
    { diaLower: 200, lenLower: 500, distribution: 50 },
  ] as HprProduct["cells"],
};
let n = 0;
const stock = (len: number, orsak: string): HprLog => ({
  stemKey: `s${n}`, logKey: `l${n++}`, productKey: "P1", harvestDate: null, lengthCm: len,
  diaTopObMm: 250, diaTopUbMm: 240, volPriceM3: 1, volSobM3: 1, volSubM3: 1, cuttingReason: orsak,
});

describe("byggObjektVy på maskinens kap", () => {
  // Maskinen: 5 × 400 + 5 × 500 = exakt beställt. Föraren kortar 10 stockar till 400.
  const stockar = [
    ...Array.from({ length: 5 }, () => stock(410, "Automatic")),
    ...Array.from({ length: 5 }, () => stock(510, "Automatic")),
    ...Array.from({ length: 10 }, () => stock(410, "Other manual")),
  ];
  const vy = byggObjektVy({ objectKey: "o", produkter: [produkt], stockar },
    { objektNamn: "X", status: "completed", lastFileAt: null }, [], new Date())!;
  const p = vy.produkter[0];

  it("maskinen träffade beställningen: 100 %, 0 m³ utanför — förarens kortningar räknas inte som miss", () => {
    expect(p.gradeAutomatic).toBe(100);
    expect(p.utanforM3).toBe(0);
    expect(p.volymAutoM3).toBe(10);
    expect(vy.utanforM3).toBe(0);
    expect(vy.bedomdM3).toBe(10);
    expect(p.forcedCutSharePct).toBe(50);
    expect(p.gradePct).toBeLessThan(100); // alla stockar: 15 × 400 mot 5 × 500 — står bara under "När föraren kortar"
  });
  it("längderna är maskinens: kapat = beställt per längd", () => {
    expect(p.vältor).toEqual([
      { lenLower: 400, actualM3: 5, orderedM3: 5 },
      { lenLower: 500, actualM3: 5, orderedM3: 5 },
    ]);
    expect(p.mening).toBeNull();
    expect(p.färgadeRutor).toBe(0);
  });
});
