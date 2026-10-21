import { describe, it, expect } from "vitest";
import { gruppFor, slaIhopData, traktGrupper, traktMeta, type TraktMeta } from "./sammaTrakt";
import type { ObjektData } from "./objekt-data";
import type { HprProduct } from "./hpr-parser";

const o = (key: string, namn: string | null, fil: string | null, status: "active" | "completed" = "completed"): TraktMeta =>
  ({ object_key: key, object_name: namn, status, last_file_at: fil });

// Prod 2026-10-21 (harvest_objects): Giantens Bågskyttebanan i två objekt, sista filen
// en timme isär; Hushållningssällskapet = beställarens namn på två jobb, maj och juni.
const BAG = "Bågskyttebanan RP J-Hus- 25";
const HUS = "HUSHÅLLNINGSSÄLLSKAPET DALARNA GÄVLEBORG";
const PROD = [
  o("PONS20SDJAA270231:134", BAG, "2026-10-13T08:21:21Z"),
  o("PONS20SDJAA270231:133", BAG, "2026-10-13T09:25:10Z"),
  o("PONS20SDJAA270231:100", HUS, "2026-05-08T12:00:00Z"),
  o("PONS20SDJAA270231:109", HUS, "2026-06-17T12:00:00Z"),
  o("PONS20SDJAA270231:136", "Mölleryd", "2026-10-20T12:00:00Z"),
];

describe("traktGrupper — samma maskin, samma namn, sista filen inom 7 dagar", () => {
  it("Bågskyttebanan blir EN trakt, Hushållningssällskapet två", () => {
    const g = traktGrupper(PROD);
    expect(g).toContainEqual(["PONS20SDJAA270231:133", "PONS20SDJAA270231:134"]);
    expect(g).toContainEqual(["PONS20SDJAA270231:100"]);
    expect(g).toContainEqual(["PONS20SDJAA270231:109"]);
    expect(g).toContainEqual(["PONS20SDJAA270231:136"]);
    expect(g).toHaveLength(4);
  });

  it("gränsen: 7 dagar slås ihop, 7 dagar och en minut inte", () => {
    const sju = traktGrupper([o("M:1", "A", "2026-10-01T00:00:00Z"), o("M:2", "A", "2026-10-08T00:00:00Z")]);
    expect(sju).toEqual([["M:1", "M:2"]]);
    const over = traktGrupper([o("M:1", "A", "2026-10-01T00:00:00Z"), o("M:2", "A", "2026-10-08T00:01:00Z")]);
    expect(over).toHaveLength(2);
  });

  it("kedjat: A–B och B–C inom gränsen ger en trakt", () => {
    const g = traktGrupper([o("M:1", "A", "2026-10-01T00:00:00Z"), o("M:2", "A", "2026-10-06T00:00:00Z"), o("M:3", "A", "2026-10-11T00:00:00Z")]);
    expect(g).toEqual([["M:1", "M:2", "M:3"]]);
  });

  it("annan maskin, annat namn, tomt namn eller saknad fil slås aldrig ihop", () => {
    const t = "2026-10-01T00:00:00Z";
    expect(traktGrupper([o("M:1", "A", t), o("N:1", "A", t)])).toHaveLength(2);
    expect(traktGrupper([o("M:1", "A", t), o("M:2", "A ", t)])).toHaveLength(1); // trim
    expect(traktGrupper([o("M:1", "A", t), o("M:2", "a", t)])).toHaveLength(2); // exakt namn
    expect(traktGrupper([o("M:1", "", t), o("M:2", "", t)])).toHaveLength(2);
    expect(traktGrupper([o("M:1", null, t), o("M:2", null, t)])).toHaveLength(2);
    expect(traktGrupper([o("M:1", "A", null), o("M:2", "A", t)])).toHaveLength(2);
  });

  it("huvudnyckeln är densamma oavsett ordning", () => {
    expect(gruppFor("PONS20SDJAA270231:134", PROD)[0]).toBe("PONS20SDJAA270231:133");
    expect(gruppFor("PONS20SDJAA270231:133", [...PROD].reverse())[0]).toBe("PONS20SDJAA270231:133");
    expect(gruppFor("X:1", PROD)).toEqual(["X:1"]);
  });
});

describe("traktMeta", () => {
  it("huvudnyckelns namn, senaste filen, aktiv om någon del är aktiv", () => {
    const m = traktMeta([o("M:2", "A", "2026-10-02T00:00:00Z", "active"), o("M:1", "A", "2026-10-01T00:00:00Z")]);
    expect(m).toEqual({ object_key: "M:1", object_name: "A", status: "active", last_file_at: "2026-10-02T00:00:00Z" });
    expect(traktMeta([o("M:1", "A", "2026-10-01T00:00:00Z"), o("M:2", "A", "2026-10-02T00:00:00Z")]).status).toBe("completed");
  });
});

const produkt = (key: string, distribution = 50, mal = true): HprProduct => ({
  productKey: key, name: key, group: null, speciesGroupKey: null, classified: true,
  diaClassCategory: null, diameterUnderBark: null, diaLimits: [], diaMax: null, lenLimits: [], lenMax: null,
  distributionAllowed: mal, distributionCategory: null, maxDeviation: null,
  cells: [{ diaLower: 200, lenLower: 430, price: 1, distribution, limitation: 0, buckingCriteria: null }],
} as unknown as HprProduct);
const data = (key: string, produkter: HprProduct[], stockar: number): ObjektData => ({
  objectKey: key, produkter,
  stockar: Array.from({ length: stockar }, (_, i) => ({ stemKey: `${key}-${i}`, logKey: 1, productKey: produkter[0]?.productKey ?? "p" } as any)),
});

describe("slaIhopData", () => {
  it("alla stockar, varje produkt en gång, under huvudnyckeln", () => {
    const d = slaIhopData("M:1", [data("M:1", [produkt("497"), produkt("459")], 3), data("M:2", [produkt("497")], 2)]);
    expect(d.objectKey).toBe("M:1");
    expect(d.stockar).toHaveLength(5);
    expect(d.produkter.map((p) => p.productKey).sort()).toEqual(["459", "497"]);
  });

  it("samma produkt med olika beställning slås inte ihop — det kastar", () => {
    expect(() => slaIhopData("M:1", [data("M:1", [produkt("497", 50)], 1), data("M:2", [produkt("497", 60)], 1)])).toThrow(/olika beställning/);
    expect(() => slaIhopData("M:1", [data("M:1", [produkt("497", 50, true)], 1), data("M:2", [produkt("497", 50, false)], 1)])).toThrow(/olika beställning/);
  });
});
