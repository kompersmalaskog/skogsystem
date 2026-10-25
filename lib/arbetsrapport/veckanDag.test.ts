import { describe, it, expect } from "vitest";
import { byggVecka } from "./veckanDag";
import { readFileSync } from "fs";
import { join } from "path";

// Onsdag 21 oktober 2026
const NU = new Date(2026, 9, 21, 15, 0);

describe("byggVecka", () => {
  it("räknar maskintid + extra tid per dag, mån–fre även utan tid", () => {
    const v = byggVecka(NU, [
      { datum: "2026-10-19", arbetad_min: 480, bekraftad: true },
      { datum: "2026-10-20", arbetad_min: 400, bekraftad: false },
    ], [{ datum: "2026-10-20", minuter: 30 }, { datum: "2026-10-21", minuter: 60 }]);
    expect(v.rader.map(r => r.datum)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
    expect(v.rader.map(r => r.min)).toEqual([480, 430, 60, 0, 0]);
    expect(v.totalMin).toBe(970);
    expect(v.rader[0].bekraftad).toBe(true);
    expect(v.rader[2].idag).toBe(true);
    expect(v.rader[3].framtid).toBe(true);
  });

  it("helgdag visas bara med tid", () => {
    const v = byggVecka(new Date(2026, 9, 25, 12), [{ datum: "2026-10-24", arbetad_min: 120 }], []);
    expect(v.rader.map(r => r.dag)).toEqual(["mån", "tis", "ons", "tor", "fre", "lör"]);
    expect(v.totalMin).toBe(120);
  });

  it("veckan börjar på måndag också en söndag", () => {
    const v = byggVecka(new Date(2026, 9, 25, 12), [], []);
    expect(v.rader[0].datum).toBe("2026-10-19");
  });
});

describe("Dag-vyns två kolumner (källvakt)", () => {
  const src = readFileSync(join(__dirname, "../../components/arbetsrapport/Arbetsrapport.tsx"), "utf8");
  it("container + grid från DAG_TVA_KOLUMNER_PX, smal kolumn under", () => {
    expect(src).toMatch(/\.ar-dag-ram \{ container-type: inline-size; \}/);
    expect(src).toMatch(/\.ar-dag \{ max-width: \$\{KOLUMN\.smal\}px; margin: 0 auto; \}/);
    expect(src).toMatch(/@container \(min-width: \$\{DAG_TVA_KOLUMNER_PX\}px\)/);
    expect(src).toMatch(/\.ar-dag-gor \{ grid-column: 1;[^}]*position: sticky/);
  });
  it("veckan och Att fixa-rubriken syns bara brett", () => {
    expect(src).toMatch(/\.ar-bara-bred \{ display: none; \}/);
    expect(src).toMatch(/className="ar-dag-las ar-bara-bred"/);
  });
  it("inga citattecken i kolumnernas CSS", () => {
    const m = src.match(/export const DAG_KOLUMN_CSS = `([\s\S]*?)`;/);
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/["']/);
  });
});
