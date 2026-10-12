// Fortnox-raderna får sina löneartskoder ur lonesystem_artikelmappning (lib/lonesystem/loneart), inte ur koden.
// Saknas en kod skickas ingen rad: mängden syns som varning, aldrig en gissad löneart.
import { describe, it, expect } from "vitest";
import { beräknaExport } from "./loneberakning";
import { PROD_KODER } from "./testKoder";
import type { Loneartskoder } from "./loneart";

const dag = (datum: string, min: number, maskin: string | null) => ({ datum, arbetad_min: min, maskin_id: maskin, km_totalt: 0, bekraftad: true, dagtyp: null });
const TYP = { SK: "skordare" as const, SO: "skotare" as const };

/** Tre arbetsdagar, 10 h på två av dem → övertid; 70 km en dag → körersättning; skördare. */
function kor(koder: Loneartskoder) {
  const dagar = [
    { ...dag("2026-09-07", 600, "R64428"), km_totalt: 80 },
    dag("2026-09-08", 600, "R64428"),
    dag("2026-09-09", 480, "R64428"),
  ];
  return beräknaExport("m", "Anna", "7", dagar, { R64428: TYP.SK }, "2026-10", [], [], 60, null, new Set(), null, null, koder);
}
const koder = (u: ReturnType<typeof kor>) => u.rader.map(r => `${r.loneart}:${r.SalaryCode}`).sort();

describe("löneartskoder ur mappningen", () => {
  it("med produktionens koder blir raderna de som skickas i dag (11, 1355, 1435, 136, 821)", () => {
    const u = kor(PROD_KODER);
    expect(koder(u)).toEqual(["korersattning:821", "overtid_skordare:1435", "premielon_skordare:1355", "timlon:11", "valtlappar:136"]);
    expect(u.saknade_loneartskoder).toEqual([]);
  });
  it("ändrar man koden i mappningen ändras raden, och inget annat", () => {
    const fore = kor(PROD_KODER);
    const efter = kor({ ...PROD_KODER, timlon: "99" });
    expect(efter.rader.find(r => r.loneart === "timlon")!.SalaryCode).toBe("99");
    // samma antal, samma mängder, samma texter — bara koden på timlönen skiljer
    expect(efter.rader.map(r => [r.loneart, r.Number, r.beskrivning])).toEqual(fore.rader.map(r => [r.loneart, r.Number, r.beskrivning]));
    expect(efter.rader.filter(r => r.loneart !== "timlon").map(r => r.SalaryCode)).toEqual(fore.rader.filter(r => r.loneart !== "timlon").map(r => r.SalaryCode));
  });
  it("skotarens övertid går på overtid_skotare", () => {
    const dagar = [dag("2026-09-07", 600, "A030353"), dag("2026-09-08", 600, "A030353")];
    const u = beräknaExport("m", "X", "7", dagar, { A030353: TYP.SO }, "2026-10", [], [], 60, null, new Set(), null, null, { ...PROD_KODER, overtid_skotare: "1436" });
    expect(u.rader.find(r => r.loneart === "overtid_skotare")!.SalaryCode).toBe("1436");
  });
  it("saknas en kod: ingen rad, en varning med mängden, och nyckeln i saknade_loneartskoder", () => {
    const { valtlappar, ...utanValtlappar } = PROD_KODER;
    const u = kor(utanValtlappar);
    expect(u.rader.some(r => r.loneart === "valtlappar")).toBe(false);
    expect(u.saknade_loneartskoder).toEqual(["valtlappar"]);
    expect(u.varningar.find(v => /^Löneart saknas för Vältlappar/.test(v))).toMatch(/3 veckor|1 veckor|1 vecka/);
    expect(u.varningar.join(" ")).toMatch(/Lön → Lönesystem/);
  });
  it("utan några koder alls skickas inga rader, och varje saknad löneart står en gång", () => {
    const u = kor({});
    expect(u.rader).toEqual([]);
    expect(u.saknade_loneartskoder.sort()).toEqual(["korersattning", "overtid_skordare", "premielon_skordare", "timlon", "valtlappar"]);
  });
});
