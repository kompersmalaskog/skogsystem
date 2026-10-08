import { describe, it, expect } from "vitest";
import { LONEARTER, loneartskoder, loneartInfo } from "./loneart";

describe("lönearterna är EN lista", () => {
  it("sju lönearter, och varje har etikett och enhet", () => {
    expect(LONEARTER.map(l => l.key)).toEqual(["timlon", "premielon_skordare", "premielon_skotare", "overtid_skordare", "overtid_skotare", "valtlappar", "korersattning"]);
    for (const l of LONEARTER) { expect(l.label.length).toBeGreaterThan(2); expect(["tim", "veckor", "mil"]).toContain(l.enhet); }
  });
  it("loneartskoder: tar bara kända nycklar, trimmar och hoppar över tomma koder", () => {
    const k = loneartskoder([
      { intern_typ: "timlon", extern_kod: " 11 " },
      { intern_typ: "valtlappar", extern_kod: "" },
      { intern_typ: "overtid_skordare", extern_kod: null },
      { intern_typ: "okand_typ", extern_kod: "999" },
      { intern_typ: "korersattning", extern_kod: "821" },
    ]);
    expect(k).toEqual({ timlon: "11", korersattning: "821" });
  });
  it("loneartInfo hittar etikett och enhet, och ger null för det som inte finns", () => {
    expect(loneartInfo("valtlappar")).toMatchObject({ label: "Vältlappar", enhet: "veckor" });
    expect(loneartInfo("finns_inte")).toBeNull();
  });
});
