// Brandrisk-OB som lönerader (beslut Martin 2026-10-15): en beordrad brandriskmorgon ger TVÅ rader, båda med tom kod som standard —
// "Brandrisk – OB" (start → 06:30) och "Brandrisk – nattillägg" (de av timmarna som ligger 00:00–05:00, utöver OB, § 8 mom 1).
// Exakta timmar, två decimaler. Ingen annan OB: kväll, lördag och söndag räknas aldrig.
import { describe, it, expect } from "vitest";
import { beräknaExport } from "./loneberakning";
import { PROD_KODER } from "./testKoder";
import type { Loneartskoder } from "./loneart";

const TYP = { SK: "skordare" as const };
const dag = (datum: string, start_tid: string | null, brandrisk_beordrad: boolean | null, min = 600) =>
  ({ datum, arbetad_min: min, maskin_id: "R64428", km_totalt: 0, bekraftad: true, dagtyp: null, start_tid, brandrisk_beordrad });
const kor = (dagar: any[], koder: Loneartskoder = PROD_KODER) =>
  beräknaExport("m", "Stefan", "7", dagar, { R64428: TYP.SK }, "2026-09", [], [], 60, null, new Set(), null, null, koder);

// Stefan Karlssons augusti 2026 (produktionsdata, klockslagen är hans): tre beordrade brandriskmorgnar 12–14 aug, resten eget val.
const STEFAN_AUG = [
  dag("2026-08-03", "05:58:00", null), dag("2026-08-04", "05:48:00", false), dag("2026-08-05", "05:50:00", false),
  dag("2026-08-12", "03:05:00", true, 539), dag("2026-08-13", "03:00:00", true, 594), dag("2026-08-14", "03:07:00", true, 607),
  dag("2026-08-17", "05:51:00", null), dag("2026-08-31", "06:21:00", null, 628),
];
const MED_KODER: Loneartskoder = { ...PROD_KODER, brandrisk_ob: "147", brandrisk_nattillagg: "1470" };

describe("facit: Stefan Karlsson augusti 2026", () => {
  it("10,30 tim Brandrisk – OB och 5,80 tim Brandrisk – nattillägg (03:00–05:00 de tre morgnarna)", () => {
    const u = kor(STEFAN_AUG, MED_KODER);
    expect(u.brandrisk.ob_min).toBe(618);
    expect(u.brandrisk.natt_min).toBe(348);
    const ob = u.rader.find(r => r.loneart === "brandrisk_ob")!;
    const natt = u.rader.find(r => r.loneart === "brandrisk_nattillagg")!;
    expect(ob).toMatchObject({ SalaryCode: "147", Number: "10.30", Date: "2026-09-01", EmployeeId: "7" });
    expect(natt).toMatchObject({ SalaryCode: "1470", Number: "5.80", Date: "2026-09-01" });
    expect(u.lonerader.filter(l => l.loneart.startsWith("brandrisk")).map(l => [l.loneart, l.mangd, l.status])).toEqual([
      ["brandrisk_ob", "10.30", "skickas"], ["brandrisk_nattillagg", "5.80", "skickas"],
    ]);
  });

  it("31 aug (06:21–16:49) ger ingen egen OB: facit-datumet är bara dagen lönehanteraren skrev månadssumman på", () => {
    const u = kor([dag("2026-08-31", "06:21:00", null, 628)], MED_KODER);
    expect(u.brandrisk).toEqual({ ob_min: 0, natt_min: 0, dagar: [] });
    expect(u.rader.some(r => r.loneart.startsWith("brandrisk"))).toBe(false);
  });

  it("de tre morgnarna är dagarna bakom summan", () => {
    expect(kor(STEFAN_AUG).brandrisk.dagar.map(d => d.datum)).toEqual(["2026-08-12", "2026-08-13", "2026-08-14"]);
  });
});

describe("tom kod = ingen rad, en varning och en blockerande saknad kod (som övriga lönearter)", () => {
  it("båda raderna saknar kod: syns som röda rader med mängden, skickas inte", () => {
    const u = kor(STEFAN_AUG);                                     // PROD_KODER har ingen brandrisk-kod
    expect(u.rader.some(r => r.loneart.startsWith("brandrisk"))).toBe(false);
    expect(u.lonerader.filter(l => l.loneart.startsWith("brandrisk")).map(l => [l.loneart, l.mangd, l.status, l.kod])).toEqual([
      ["brandrisk_ob", "10.30", "saknar_kod", null], ["brandrisk_nattillagg", "5.80", "saknar_kod", null],
    ]);
    expect(u.saknade_loneartskoder).toEqual(expect.arrayContaining(["brandrisk_ob", "brandrisk_nattillagg"]));
    expect(u.varningar.find(v => /^Löneart saknas för Brandrisk – OB/.test(v))).toMatch(/10\.3 tim/);
    expect(u.varningar.find(v => /^Löneart saknas för Brandrisk – nattillägg/.test(v))).toMatch(/5\.8 tim/);
  });

  it("bara OB har kod: nattillägget är fortfarande en saknad kod", () => {
    const u = kor(STEFAN_AUG, { ...PROD_KODER, brandrisk_ob: "147" });
    expect(u.rader.filter(r => r.loneart.startsWith("brandrisk")).map(r => r.loneart)).toEqual(["brandrisk_ob"]);
    expect(u.saknade_loneartskoder).toEqual(["brandrisk_nattillagg"]);
  });
});

describe("bara den beordrade brandriskmorgonen — ingen annan OB", () => {
  it("lördag och söndag ger ingen rad, även med svaret ja (helg byggs inte)", () => {
    const u = kor([dag("2026-08-15", "03:00:00", true), dag("2026-08-16", "03:00:00", true)], MED_KODER);
    expect(u.brandrisk.ob_min).toBe(0);
    expect(u.rader.some(r => r.loneart.startsWith("brandrisk"))).toBe(false);
  });

  it("start efter 05:00 ger OB men inget nattillägg: 05:15 → 75 min = 1,25 tim OB, ingen natt-rad", () => {
    const u = kor([dag("2026-08-12", "05:15:00", true)], MED_KODER);
    expect(u.rader.find(r => r.loneart === "brandrisk_ob")).toMatchObject({ Number: "1.25" });
    expect(u.rader.some(r => r.loneart === "brandrisk_nattillagg")).toBe(false);
  });

  it("obesvarat och nej ger ingenting; saknas fälten helt (äldre anropare) räknas ingen OB", () => {
    expect(kor([dag("2026-08-12", "03:05:00", null), dag("2026-08-13", "03:00:00", false)], MED_KODER).brandrisk.ob_min).toBe(0);
    const utanFalt = { datum: "2026-08-12", arbetad_min: 600, maskin_id: "R64428", km_totalt: 0, bekraftad: true, dagtyp: null };
    expect(kor([utanFalt], MED_KODER).brandrisk.ob_min).toBe(0);
  });

  it("OB läggs BARA till: alla andra rader, varningar och summor är identiska med och utan brandriskfälten", () => {
    const utanOb = STEFAN_AUG.map(d => ({ ...d, brandrisk_beordrad: null }));
    const med = kor(STEFAN_AUG, MED_KODER), utan = kor(utanOb, MED_KODER);
    expect(med.rader.filter(r => !r.loneart.startsWith("brandrisk"))).toEqual(utan.rader);
    expect(med.varningar).toEqual(utan.varningar);
    const { brandrisk: _a, rader: _b, lonerader: _c, ...restMed } = med as any;
    const { brandrisk: _d, rader: _e, lonerader: _f, ...restUtan } = utan as any;
    expect(restMed).toEqual(restUtan);
    expect(med.rader.length).toBe(utan.rader.length + 2);
  });

  it("nattillägget är aldrig fler timmar än OB", () => {
    const u = kor(STEFAN_AUG, MED_KODER);
    expect(u.brandrisk.natt_min).toBeLessThanOrEqual(u.brandrisk.ob_min);
  });
});
