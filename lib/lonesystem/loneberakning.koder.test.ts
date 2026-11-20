// Fortnox-raderna får sina löneartskoder ur lonesystem_artikelmappning (lib/lonesystem/loneart), inte ur koden.
// Saknas en kod skickas ingen rad: mängden syns som varning, aldrig en gissad löneart.
// Premielönen är FRIVILLIG: saknas dess kod hoppas raden över med en varning, och den stoppar inte exporten.
import { describe, it, expect } from "vitest";
import { beräknaExport } from "./loneberakning";
import { PROD_KODER } from "./testKoder";
import type { Loneartskoder } from "./loneart";

const dag = (datum: string, min: number, maskin: string | null) => ({ datum, arbetad_min: min, maskin_id: maskin, km_totalt: 0, bekraftad: true, dagtyp: null });
const TYP = { SK: "skordare" as const, SO: "skotare" as const };

/** Septembers 22 vardagar (månadens ordinarie = 176 tim): 10 h på de två första, 8 h på resten → 4 tim övertid; 80 km en dag → körersättning. */
const SEP = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`).filter(d => { const w = new Date(d + "T00:00:00Z").getUTCDay(); return w !== 0 && w !== 6; });
const fullManad = (maskin: string) => SEP.map((d, i) => dag(d, i < 2 ? 600 : 480, maskin));

function kor(koder: Loneartskoder) {
  const dagar = fullManad("R64428");
  dagar[0] = { ...dagar[0], km_totalt: 80 };
  return beräknaExport("m", "Anna", "7", dagar, { R64428: TYP.SK }, "2026-10", [], [], 60, null, new Set(), null, null, koder);
}
const koder = (u: ReturnType<typeof kor>) => u.rader.map(r => `${r.loneart}:${r.SalaryCode}`).sort();

describe("löneartskoder ur mappningen", () => {
  it("med produktionens koder blir raderna de som skickas i dag (11, 1355, 1435, 136, 821)", () => {
    const u = kor(PROD_KODER);
    expect(koder(u)).toEqual(["korersattning:821", "overtid_skordare:1435", "premielon_skordare:1355", "timlon:11", "valtlappar:136"]);
    expect(u.saknade_loneartskoder).toEqual([]);
  });
  it("en Fortnox-rad har exakt de fält den hade (inget nytt läcker in i det som skickas)", () => {
    const u = kor(PROD_KODER);
    for (const r of u.rader) expect(Object.keys(r).sort()).toEqual(["Date", "EmployeeId", "Number", "SalaryCode", "beskrivning", "loneart"]);
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
    const dagar = fullManad("A030353");
    const u = beräknaExport("m", "X", "7", dagar, { A030353: TYP.SO }, "2026-10", [], [], 60, null, new Set(), null, null, { ...PROD_KODER, overtid_skotare: "1436" });
    expect(u.rader.find(r => r.loneart === "overtid_skotare")!.SalaryCode).toBe("1436");
  });
  it("saknas en kod: ingen rad, en varning med mängden, och nyckeln i saknade_loneartskoder", () => {
    const { valtlappar, ...utanValtlappar } = PROD_KODER;
    const u = kor(utanValtlappar);
    expect(u.rader.some(r => r.loneart === "valtlappar")).toBe(false);
    expect(u.saknade_loneartskoder).toEqual(["valtlappar"]);
    expect(u.varningar.find(v => /^Löneart saknas för Vältlappar/.test(v))).toMatch(/5 veckor/);
    expect(u.varningar.join(" ")).toMatch(/Lön → Lönearter/);
    expect(u.varningar.join(" ")).not.toMatch(/Lön → Lönesystem/);
  });
  it("en TOM kod är samma sak som ingen kod: ingen rad, ingen gissning", () => {
    const u = kor({ ...PROD_KODER, timlon: "", korersattning: "   " });
    expect(u.rader.some(r => r.loneart === "timlon" || r.loneart === "korersattning")).toBe(false);
    expect(u.saknade_loneartskoder.sort()).toEqual(["korersattning", "timlon"]);
  });
  it("utan några koder alls skickas inga rader; blockerande är de som inte är frivilliga, och varje står en gång", () => {
    const u = kor({});
    expect(u.rader).toEqual([]);
    expect(u.saknade_loneartskoder.sort()).toEqual(["korersattning", "overtid_skordare", "timlon", "valtlappar"]);
  });
});

describe("premielön är frivillig", () => {
  const { premielon_skordare, premielon_skotare, ...utanPremie } = PROD_KODER;

  it("saknas premiens kod hoppas raden över, utan att räknas som saknad kod som stoppar exporten", () => {
    const u = kor(utanPremie);
    expect(koder(u)).toEqual(["korersattning:821", "overtid_skordare:1435", "timlon:11", "valtlappar:136"]);
    expect(u.saknade_loneartskoder).toEqual([]);
  });
  it("men det syns: en varning med mängden, och raden finns kvar i förhandsvisningen som 'frivillig utan kod'", () => {
    const u = kor(utanPremie);
    const varning = u.varningar.find(v => /^Premielön skördare/.test(v));
    expect(varning).toMatch(/176 tim/);
    expect(varning).toMatch(/skickas inte/);
    expect(varning).toMatch(/Lön → Lönearter/);
    const rad = u.lonerader.find(r => r.loneart === "premielon_skordare")!;
    expect(rad).toMatchObject({ status: "valfri_utan_kod", kod: null, mangd: "176.00" });
  });
  it("kraschar inte, och övriga rader är oförändrade mot när premien har kod", () => {
    const med = kor(PROD_KODER);
    const utan = kor(utanPremie);
    expect(utan.rader).toEqual(med.rader.filter(r => !r.loneart.startsWith("premielon")));
  });
});

describe("lonerader: varje rad som HAR antal, med sin status", () => {
  it("med alla koder är alla rader 'skickas', i samma ordning och med samma mängd som Fortnox-raderna", () => {
    const u = kor(PROD_KODER);
    expect(u.lonerader.map(r => r.status)).toEqual(u.lonerader.map(() => "skickas"));
    expect(u.lonerader.map(r => [r.loneart, r.kod, r.mangd])).toEqual(u.rader.map(r => [r.loneart, r.SalaryCode, r.Number]));
    expect(u.lonerader.map(r => r.loneart)).toEqual(["timlon", "premielon_skordare", "overtid_skordare", "valtlappar", "korersattning"]);
  });
  it("en rad utan kod finns kvar med status 'saknar_kod' och kod null", () => {
    const { valtlappar, ...utan } = PROD_KODER;
    const u = kor(utan);
    expect(u.lonerader.find(r => r.loneart === "valtlappar")).toMatchObject({ status: "saknar_kod", kod: null, mangd: "5" });
    expect(u.rader.some(r => r.loneart === "valtlappar")).toBe(false);
  });
  it("en löneart utan antal syns inte alls (ingen helglön, ingen övertid)", () => {
    const u = beräknaExport("m", "X", "7", [dag("2026-09-07", 480, "R64428")], { R64428: TYP.SK }, "2026-10", [], [], 60, null, new Set(), null, null, PROD_KODER);
    expect(u.lonerader.map(r => r.loneart)).toEqual(["timlon", "premielon_skordare", "valtlappar"]);
  });
});

describe("'1 vecka', inte '1 veckor' (Martin 2026-10-21)", () => {
  const enDag = [dag("2026-09-02", 480, "R64428")];
  it("vältlappsraden och varningen säger 'vecka' vid en vecka och 'veckor' annars", () => {
    const { valtlappar, ...utan } = PROD_KODER;
    const en = beräknaExport("m", "Anna", "7", enDag, { R64428: TYP.SK }, "2026-10", [], [], 60, null, new Set(), null, null, PROD_KODER);
    expect(en.rader.find(r => r.loneart === "valtlappar")!.beskrivning).toBe("Vältlappar: 1 vecka");
    const enUtanKod = beräknaExport("m", "Anna", "7", enDag, { R64428: TYP.SK }, "2026-10", [], [], 60, null, new Set(), null, null, utan);
    expect(enUtanKod.varningar.find(v => /^Löneart saknas för Vältlappar/.test(v))).toMatch(/\(1 vecka\)/);
    const fem = kor(PROD_KODER);
    expect(fem.rader.find(r => r.loneart === "valtlappar")!.beskrivning).toBe("Vältlappar: 5 veckor");
    expect(kor(utan).varningar.find(v => /^Löneart saknas för Vältlappar/.test(v))).toMatch(/\(5 veckor\)/);
  });
});

