// VAKT: ett namn på en gs_avtal-kolumn i koden som inte finns i prod. `gsAvtal?.atk_ledig_tim ?? 65.2` kompilerade i åratal
// (raden är `any`) och visades för förarna som om det vore avtalet. Här läses källfilerna som läser gs_avtal-raden, och varje
// `gsAvtal.x` / `avtal.x` / `a.x` måste vara en kolumn i GS_AVTAL_KOLUMNER (lib/gs-avtal, kopierad ur prod 2026-10-14).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GS_AVTAL_KOLUMNER } from "./gs-avtal";

const rot = path.resolve(__dirname, "..");
const KOLUMNER = new Set<string>(GS_AVTAL_KOLUMNER);

// [fil, variabelnamn som håller gs_avtal-raden]
const LASARE: [string, string][] = [
  ["components/arbetsrapport/Arbetsrapport.tsx", "gsAvtal"],
  ["app/api/fortnox/employee-details/route.ts", "avtal"],
  ["app/api/app-state/route.ts", "avtal"],
  ["lib/avtalVy.ts", "a"],
  ["lib/gs-avtal.ts", "avtal"],
  ["components/admin/AvtalFlik.tsx", "aktuellt"],
];

function faltIKod(kalla: string, variabel: string): string[] {
  // `gsAvtal?.x`, `gsAvtal.x`, `avtal?.x`, `a.x` — bara som ett helt ord före punkten
  const re = new RegExp(`(?<![\\w.])${variabel}\\??\\.([a-z_][a-z0-9_]*)`, "gi");
  const ut = new Set<string>();
  for (const m of Array.from(kalla.matchAll(re))) ut.add(m[1]);
  return Array.from(ut);
}

describe("gs_avtal: koden läser bara kolumner som finns", () => {
  for (const [fil, variabel] of LASARE) {
    it(`${fil} (${variabel}.…)`, () => {
      const kalla = fs.readFileSync(path.join(rot, fil), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")          // kommentarer nämner gamla felnamn med flit
        .replace(/\/\/.*$/gm, "");
      const okanda = faltIKod(kalla, variabel).filter(f => !KOLUMNER.has(f));
      expect(okanda, `okända gs_avtal-fält i ${fil}`).toEqual([]);
    });
  }

  it("vakten ser ett felnamn (kontroll av vakten själv)", () => {
    expect(faltIKod("x = gsAvtal?.atk_ledig_tim ?? 65.2; y = gsAvtal.namn", "gsAvtal").filter(f => !KOLUMNER.has(f))).toEqual(["atk_ledig_tim"]);
    expect(faltIKod("const t = numeriskt(avtal?.timlon_kr)", "avtal").filter(f => !KOLUMNER.has(f))).toEqual(["timlon_kr"]);
  });
});
