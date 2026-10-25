import { describe, it, expect } from "vitest";
import { raknaSjuktimmar } from "./sjuktimmar";
import { beräknaExport } from "./loneberakning";
import { PROD_KODER } from "./testKoder";
const TEST_KODER = { ...PROD_KODER, sjuktimmar: "9999" };

describe("raknaSjuktimmar", () => {
  it("8 tim per sjuk vardag, helger och röda dagar räknas inte", () => {
    // fre 2 okt, lör 3, sön 4, mån 5 okt 2026
    const r = raknaSjuktimmar({ heldagar: ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"], deldagar: [], rodaDagar: [] });
    expect(r.dagar.map(d => d.datum)).toEqual(["2026-10-02", "2026-10-05"]);
    expect(r.timmar).toBe(16);
    const jul = raknaSjuktimmar({ heldagar: ["2026-12-24", "2026-12-28"], deldagar: [], rodaDagar: ["2026-12-24"] });
    expect(jul.timmar).toBe(8);
  });
  it("deldag sjuk = dagens frånvarotimmar, annan typ räknas inte", () => {
    const r = raknaSjuktimmar({ heldagar: [], deldagar: [{ datum: "2026-10-06", typ: "sjuk", timmar: 3.5 }, { datum: "2026-10-07", typ: "vab", timmar: 4 }], rodaDagar: [] });
    expect(r).toEqual({ dagar: [{ datum: "2026-10-06", timmar: 3.5, del: true }], timmar: 3.5 });
  });
});

describe("lönemotorn: sjuktimmar", () => {
  const dag = (datum: string, min: number) => ({ datum, arbetad_min: min, maskin_id: "M1", bekraftad: true, km_totalt: 0 });
  const kor = (ledigheter: any[], koder: any = TEST_KODER) => beräknaExport("m1", "Test", "1", [dag("2026-10-01", 480), dag("2026-10-06", 270)], { M1: "skordare" }, "2026-11", [], ledigheter, 60, null, new Set(), 40, null, koder);

  it("heldag (vardagar) + deldag blir EN rad sjuktimmar", () => {
    const r = kor([
      { typ: "sjuk", startdatum: "2026-10-02", slutdatum: "2026-10-05" },          // fre–mån: 2 vardagar
      { typ: "sjuk", startdatum: "2026-10-06", slutdatum: "2026-10-06", fran_tid: "11:30" }, // jobbade 4,5 tim
    ]);
    expect(r.sjuk.timmar).toBe(19.5);
    const rad = r.lonerader.find(l => l.loneart === "sjuktimmar");
    expect(rad?.mangd).toBe("19.50");
    expect(rad?.status).toBe("skickas");
    expect(r.varningar.some(v => /Frånvaro \(sjuk\)|Deldag \(sjuk\)/.test(v))).toBe(false);
  });

  it("utan kod: blockerar (saknad kod) och skickas inte", () => {
    const { sjuktimmar: _, ...utan } = TEST_KODER as any;
    const r = kor([{ typ: "sjuk", startdatum: "2026-10-02", slutdatum: "2026-10-02" }], utan);
    expect(r.saknade_loneartskoder).toContain("sjuktimmar");
    expect(r.rader.some(x => x.loneart === "sjuktimmar")).toBe(false);
  });

  it("sjuk på en arbetad dag är arbete (ingen sjuktimme)", () => {
    const r = kor([{ typ: "sjuk", startdatum: "2026-10-01", slutdatum: "2026-10-01" }]);
    expect(r.sjuk.timmar).toBe(0);
    expect(r.lonerader.some(l => l.loneart === "sjuktimmar")).toBe(false);
  });

  it("företagsledare får inga sjuktimmar", () => {
    const r = beräknaExport("m1", "Test", "1", [], {}, "2026-11", [], [{ typ: "sjuk", startdatum: "2026-10-02", slutdatum: "2026-10-02" }], 60, null, new Set(), 40, null, TEST_KODER, { foretagsledare: true });
    expect(r.sjuk.timmar).toBe(0);
    expect(r.rader).toEqual([]);
  });
});
