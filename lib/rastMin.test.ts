// Rastminuter: EN avrundningsregel överallt. Tabellen (lib/__fixtures__/rast_avrundning.json) läses av detta test OCH av
// scripts/test_rast_min.py mot importens funktion, så de två kan inte glida isär. Bakgrund: samma dag har setts med 18 min i
// ena vyn och 19 i den andra — importen trunkerade (int(1139 / 60) = 18) medan routen avrundade (Math.round → 19).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rastMinFranSek } from "./rastMin";
import tabell from "./__fixtures__/rast_avrundning.json";

const rot = join(__dirname, "..");
const las = (rel: string) => readFileSync(join(rot, rel), "utf8");

describe("rastMinFranSek: närmaste minut, halv minut uppåt", () => {
  for (const { sek, min } of tabell.rader) {
    it(`${sek} s → ${min} min`, () => expect(rastMinFranSek(sek)).toBe(min));
  }
  it("Oskar 2026-10-12: 1139 s är 19 min, inte 18", () => expect(rastMinFranSek(1139)).toBe(19));
  it("saknat eller ogiltigt värde är 0, aldrig NaN", () => {
    for (const v of [null, undefined, NaN, -5, Infinity]) expect(rastMinFranSek(v as any)).toBe(0);
  });
});

describe("vakt: ingen annan kod räknar om rast-sekunder till minuter", () => {
  it("mom-import-routen går genom rastMinFranSek", () => {
    const k = las("app/api/mom-import/route.ts");
    expect(k).toContain("rastMinFranSek");
    expect(k).not.toMatch(/Math\.(round|floor|ceil|trunc)\([^)]*[rR]ast[^)]*\/\s*60/);
  });
  it("importen går genom rast_min_fran_sek (ingen trunkering)", () => {
    const k = las("skogsmaskin_import_version_6.py");
    expect(k).toContain("def rast_min_fran_sek");
    expect(k).toContain("rast_min_fran_sek(rast_sek)");
    expect(k).not.toMatch(/int\(\s*rast_sek\s*\/\s*60\s*\)/);
  });
  it("ombyggnadsskriptet använder samma regel", () => {
    const k = las("scripts/rebuild-arbetsdag-2026.py");
    expect(k).not.toMatch(/int\(\s*rast_sek\s*\/\s*60\s*\)/);
    expect(k).toContain("(rast_sek + 30) // 60");
  });
});
