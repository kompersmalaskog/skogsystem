import { describe, it, expect } from "vitest";
import { LONEARTER, loneartskoder, loneartkopplingar, loneartInfo, loneartEnhetText, enhetForMangd, fmtMangd } from "./loneart";

describe("lönearterna är EN lista", () => {
  it("elva lönearter i exportens ordning, och varje har etikett, enhet och förklaring", () => {
    expect(LONEARTER.map(l => l.key)).toEqual([
      "timlon", "premielon_skordare", "premielon_skotare", "overtid_skordare", "overtid_skotare", "valtlappar", "korersattning", "helglon_skordare", "helglon_skotare",
      "brandrisk_ob", "sjuktimmar",
    ]);
    for (const l of LONEARTER) {
      expect(l.label.length).toBeGreaterThan(2);
      expect(["tim", "veckor", "mil"]).toContain(l.enhet);
      expect(l.forklaring.length).toBeGreaterThan(10);
    }
  });

  it("OB finns bara som EN brandrisk-löneart — ingen kväll-, lördags-, söndags- eller nattilläggs-OB i katalogen (beslut 2026-10-15)", () => {
    const ob = LONEARTER.filter(l => /ob|natt/i.test(l.key + l.label)).map(l => l.key as string);
    expect(ob).toEqual(["brandrisk_ob"]);
    expect(loneartInfo("brandrisk_ob")?.label).toBe("Brandrisk – OB");
    expect(loneartInfo("brandrisk_nattillagg")).toBeNull();
    expect(loneartInfo("brandrisk_ob")?.valfri).toBe(false);          // tom kod blockerar en skarp sändning, som övriga lönearter
  });

  it("bara premielönen är valfri: saknad kod hoppar över raden i stället för att stoppa exporten", () => {
    expect(LONEARTER.filter(l => l.valfri).map(l => l.key)).toEqual(["premielon_skordare", "premielon_skotare"]);
  });

  it("etiketter och enheter hör till lönearten, aldrig till en kod: katalogen innehåller inga Fortnox-koder", () => {
    const json = JSON.stringify(LONEARTER);
    for (const kod of ["11", "1355", "1354", "1435", "1436", "136", "821", "1461", "146", "811"]) expect(json).not.toContain(`"${kod}"`);
  });

  it("loneartskoder: tar bara kända nycklar, trimmar och hoppar över tomma koder", () => {
    const k = loneartskoder([
      { intern_typ: "timlon", extern_kod: " 11 " },
      { intern_typ: "valtlappar", extern_kod: "" },
      { intern_typ: "overtid_skordare", extern_kod: null },
      { intern_typ: "okand_typ", extern_kod: "999" },
      { intern_typ: "korersattning", extern_kod: "821" },
      { intern_typ: "helglon_skordare", extern_kod: "   " },
      { intern_typ: "helglon", extern_kod: "1461" }, // den gamla nyckeln finns inte längre: används aldrig
    ]);
    expect(k).toEqual({ timlon: "11", korersattning: "821" });
  });

  it("loneartkopplingar: kod + namn i Fortnox, och en kod utan namn får tomt namn (inte undefined)", () => {
    const k = loneartkopplingar([
      { intern_typ: "timlon", extern_kod: "11", beskrivning: " Timlön " },
      { intern_typ: "korersattning", extern_kod: "821", beskrivning: null },
      { intern_typ: "valtlappar", extern_kod: "", beskrivning: "Vältlappar mm" },
      { intern_typ: "okand_typ", extern_kod: "9", beskrivning: "x" },
    ]);
    expect(k).toEqual({ timlon: { kod: "11", namn: "Timlön" }, korersattning: { kod: "821", namn: "" } });
  });

  it("loneartInfo hittar etikett och enhet, och ger null för det som inte finns", () => {
    expect(loneartInfo("valtlappar")).toMatchObject({ label: "Vältlappar", enhet: "veckor" });
    expect(loneartInfo("helglon_skordare")).toMatchObject({ label: "Helglön skördare", enhet: "tim" });
    expect(loneartInfo("helglon_skotare")).toMatchObject({ label: "Helglön skotare", enhet: "tim" });
    expect(loneartInfo("helglon")).toBeNull();
    expect(loneartInfo("finns_inte")).toBeNull();
  });

  it("enhetstexten som föraren ser: reseersättningen räknas i påbörjade mil, resten som enheten", () => {
    expect(loneartEnhetText("korersattning")).toBe("påbörjade mil");
    expect(loneartEnhetText("valtlappar")).toBe("veckor");
    expect(loneartEnhetText("timlon")).toBe("tim");
    expect(loneartEnhetText("finns_inte")).toBe("");
  });

  it("fmtMangd: svenskt decimalkomma, inga döda nollor", () => {
    expect(fmtMangd("112.00")).toBe("112");
    expect(fmtMangd("14.97")).toBe("14,97");
    expect(fmtMangd(8)).toBe("8");
    expect(fmtMangd("abc")).toBe("abc");
  });
});


describe("enheten följer antalet: '1 vecka', inte '1 veckor'", () => {
  it("vältlappar: 1 → vecka (även som '1.00'), annat → veckor, utan antal → veckor", () => {
    expect(loneartEnhetText("valtlappar", 1)).toBe("vecka");
    expect(loneartEnhetText("valtlappar", "1.00")).toBe("vecka");
    expect(loneartEnhetText("valtlappar", "1")).toBe("vecka");
    for (const n of [0, 2, "5", "1.5", "11"]) expect(loneartEnhetText("valtlappar", n), String(n)).toBe("veckor");
    expect(loneartEnhetText("valtlappar")).toBe("veckor");
  });
  it("andra enheter är orörda av antalet (1 tim, 1 påbörjade mil)", () => {
    expect(loneartEnhetText("timlon", 1)).toBe("tim");
    expect(loneartEnhetText("korersattning", 1)).toBe("påbörjade mil");
    expect(enhetForMangd("mil", 1)).toBe("mil");
  });
  it("enhetForMangd för den som bara har enheten (blockerande rader, utelämnade)", () => {
    expect(enhetForMangd("veckor", "1.00")).toBe("vecka");
    expect(enhetForMangd("veckor", "4.00")).toBe("veckor");
  });
});
