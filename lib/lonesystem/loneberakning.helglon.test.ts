// Helglön §10 blir en Fortnox-rad när lönearten har en kod i mappningen — och en röd, blockerande rad när den saknar kod.
// Beräkningen av timmarna är oförändrad (lib/lonesystem/helglon): 8 tim per röd VARDAG i avtalets lista som föraren inte arbetat.
import { describe, it, expect } from "vitest";
import { beräknaExport } from "./loneberakning";
import { PROD_KODER } from "./testKoder";
import type { Loneartskoder } from "./loneart";

const TYP = { SK: "skordare" as const };
const dag = (datum: string, min: number) => ({ datum, arbetad_min: min, maskin_id: "R64428", km_totalt: 0, bekraftad: true, dagtyp: null });
const kor = (koder: Loneartskoder, dagar = [dag("2026-12-01", 480)], loneperiod = "2027-01") =>
  beräknaExport("m", "Anna", "7", dagar, { R64428: TYP.SK }, loneperiod, [], [], 60, null, new Set(), null, null, koder);

// Arbetsmånad december 2026: julafton (tor 24), juldagen (fre 25) och nyårsafton (tor 31) är röda vardagar i avtalets lista.
// Annandag jul (26 dec) är en lördag och ger ingen helglön.
describe("helglön som Fortnox-rad", () => {
  it("MED kod: en rad 'helglon' med 8 tim per röd vardag som inte arbetats (3 dagar = 24 tim)", () => {
    const u = kor({ ...PROD_KODER, helglon: "1461" });
    expect(u.helglon.timmar).toBe(24);
    const rad = u.rader.find(r => r.loneart === "helglon")!;
    expect(rad).toMatchObject({ SalaryCode: "1461", Number: "24.00", Date: "2027-01-01" });
    expect(rad.beskrivning).toMatch(/Helglön/);
    expect(u.lonerader.find(r => r.loneart === "helglon")).toMatchObject({ status: "skickas", kod: "1461", mangd: "24.00" });
    expect(u.saknade_loneartskoder).toEqual([]);
  });

  it("UTAN kod: ingen rad, en varning med mängden, och lönearten är en BLOCKERANDE saknad kod", () => {
    const u = kor(PROD_KODER);
    expect(u.rader.some(r => r.loneart === "helglon")).toBe(false);
    expect(u.saknade_loneartskoder).toEqual(["helglon"]);
    expect(u.varningar.find(v => /^Löneart saknas för Helglön/.test(v))).toMatch(/24 tim/);
    expect(u.lonerader.find(r => r.loneart === "helglon")).toMatchObject({ status: "saknar_kod", kod: null, mangd: "24.00" });
  });

  it("tom kod är ingen kod", () => {
    const u = kor({ ...PROD_KODER, helglon: "  " });
    expect(u.rader.some(r => r.loneart === "helglon")).toBe(false);
    expect(u.saknade_loneartskoder).toEqual(["helglon"]);
  });

  it("en arbetad röd dag ger ingen helglön (§10 mom 2): 24 december arbetad → 16 tim", () => {
    const u = kor({ ...PROD_KODER, helglon: "1461" }, [dag("2026-12-01", 480), dag("2026-12-24", 480)]);
    expect(u.helglon.timmar).toBe(16);
    expect(u.rader.find(r => r.loneart === "helglon")!.Number).toBe("16.00");
  });

  it("alla röda dagar arbetade → 0 tim → ingen rad och ingen saknad kod (inget att skicka, inget att blockera)", () => {
    const u = kor(PROD_KODER, [dag("2026-12-24", 480), dag("2026-12-25", 480), dag("2026-12-31", 480)]);
    expect(u.helglon.timmar).toBe(0);
    expect(u.rader.some(r => r.loneart === "helglon")).toBe(false);
    expect(u.saknade_loneartskoder).toEqual([]);
    expect(u.lonerader.some(r => r.loneart === "helglon")).toBe(false);
  });

  it("månad utan röda vardagar (september) → ingen helglönerad, med eller utan kod", () => {
    const med = kor({ ...PROD_KODER, helglon: "1461" }, [dag("2026-09-07", 480)], "2026-10");
    const utan = kor(PROD_KODER, [dag("2026-09-07", 480)], "2026-10");
    for (const u of [med, utan]) {
      expect(u.helglon.timmar).toBe(0);
      expect(u.rader.some(r => r.loneart === "helglon")).toBe(false);
      expect(u.saknade_loneartskoder).toEqual([]);
    }
  });

  it("de andra raderna är oförändrade av att helglön tillkommer", () => {
    const utan = kor(PROD_KODER);
    const med = kor({ ...PROD_KODER, helglon: "1461" });
    expect(med.rader.filter(r => r.loneart !== "helglon")).toEqual(utan.rader);
  });

  it("informationsvarningen om avtalet finns kvar, men säger inte längre att lönearten är 'ej fastställd'", () => {
    const u = kor({ ...PROD_KODER, helglon: "1461" });
    const v = u.varningar.find(x => /^Helglön §10/.test(x))!;
    expect(v).toMatch(/24 tim/);
    expect(v).toMatch(/§10 mom 2/);
    expect(v).not.toMatch(/ej fastställd/);
    expect(v).not.toMatch(/läggs INTE som lönerad/);
  });
});
