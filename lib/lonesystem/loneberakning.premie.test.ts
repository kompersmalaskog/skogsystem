// Premielön på ALLA timlönetimmar (docs/lonesystem/premielon.md, Martins
// beslut 2026-09-29). Rena enhetstester — ingen databas.
import { describe, it, expect } from "vitest";
import { beräknaExport } from "./loneberakning";

const TYP = { SK: "skordare" as const, SO: "skotare" as const };
const dag = (datum: string, min: number, maskin: string | null) => ({ datum, arbetad_min: min, maskin_id: maskin, km_totalt: 0, bekraftad: true, dagtyp: null });
const rad = (u: ReturnType<typeof beräknaExport>, kod: string) => Number(u.rader.find(r => r.SalaryCode === kod)?.Number ?? 0);

describe("premielön = timlönetimmar, fördelad efter månadens maskintyp", () => {
  it("dag utan maskin tappar inte premien längre (Max 10 sep)", () => {
    // 3 skotardagar à 8 h + 1 dag utan maskin à 8 h → timlön 32, premie 32 på skotare.
    const u = beräknaExport("m", "Max", "7", [
      dag("2026-09-07", 480, "A030353"), dag("2026-09-08", 480, "A030353"), dag("2026-09-09", 480, "A030353"), dag("2026-09-10", 480, null),
    ], { A030353: TYP.SO }, "2026-10");
    expect(u.timlon_h).toBe(32);
    expect(u.premielon_skotare_h).toBe(32);
    expect(u.premielon_skordare_h).toBe(0);
    expect(rad(u, "1354")).toBe(32);
  });

  it("extra tid (planering, flytt) får premie — men övertid får det inte", () => {
    // 2 dagar à 8 h maskin + 4 h extra (utanför maskinen) → totalt 20, ordinarie 16.
    const u = beräknaExport("m", "X", "7", [dag("2026-09-07", 480, "R64428"), dag("2026-09-08", 480, "R64428")], { R64428: TYP.SK }, "2026-10",
      [{ datum: "2026-09-07", minuter: 240 }]);
    expect(u.timlon_h).toBe(16);
    expect(u.overtid_h).toBe(4);
    expect(u.premielon_skordare_h).toBe(16); // = timlön, inte 16 maskin + 4 extra
  });

  it("två maskintyper: timmarna utanför maskinen fördelas efter månadens andel", () => {
    // 6 h skördare + 2 h skotare i maskin, 8 h dag utan maskin → timlön 16 (2 dagar).
    const u = beräknaExport("m", "X", "7", [dag("2026-09-07", 360, "R64428"), dag("2026-09-08", 480, null), dag("2026-09-09", 120, "A030353")],
      { R64428: TYP.SK, A030353: TYP.SO }, "2026-10");
    // 3 arbetsdagar → ordinarie 24, totalt 16 → timlön 16. Andel skördare 6/8.
    expect(u.timlon_h).toBe(16);
    expect(u.premielon_skordare_h).toBe(12);
    expect(u.premielon_skotare_h).toBe(4);
    expect(u.premielon_skordare_h + u.premielon_skotare_h).toBe(u.timlon_h);
  });

  it("ingen maskintid i månaden: typen på medarbetarraden", () => {
    const u = beräknaExport("m", "Joacim", "7", [dag("2026-09-07", 0, null)], {}, "2026-10", [{ datum: "2026-09-07", minuter: 480 }], [], 60, null, new Set(), null, "skotare");
    expect(u.timlon_h).toBe(8);
    expect(u.premielon_skotare_h).toBe(8);
    expect(u.varningar.some(v => /Ingen premielön/.test(v))).toBe(false);
  });

  it("ingen maskintid OCH ingen maskin på raden: ingen premie + varning", () => {
    const u = beräknaExport("m", "Joacim", "7", [dag("2026-09-07", 0, null)], {}, "2026-10", [{ datum: "2026-09-07", minuter: 480 }]);
    expect(u.timlon_h).toBe(8);
    expect(u.premielon_skotare_h + u.premielon_skordare_h).toBe(0);
    expect(u.varningar.some(v => /^Ingen premielön/.test(v))).toBe(true);
  });

  it("summan av 1354 + 1355 är exakt timlönen även vid udda andelar", () => {
    const u = beräknaExport("m", "X", "7", [dag("2026-09-07", 470, "R64428"), dag("2026-09-08", 310, "A030353"), dag("2026-09-09", 500, null)], { R64428: TYP.SK, A030353: TYP.SO }, "2026-10");
    expect(Math.round((u.premielon_skordare_h + u.premielon_skotare_h) * 100) / 100).toBe(u.timlon_h);
  });
});
