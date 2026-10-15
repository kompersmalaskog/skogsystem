// Brandrisk-OB som lönerad (beslut Martin 2026-10-15): beordrade brandriskmorgnar ger EN rad, "Brandrisk – OB" (alla beordrade timmar,
// start → 06:30; företagets praxis, ingen uppdelning i nattillägg), med tom kod som standard (Martin kopplar den till Fortnox 147).
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
const MED_KODER: Loneartskoder = { ...PROD_KODER, brandrisk_ob: "147" };

describe("facit: Stefan Karlsson augusti 2026", () => {
  it("10,30 tim Brandrisk – OB, EN rad (de tre morgnarna 12–14 aug, start → 06:30)", () => {
    const u = kor(STEFAN_AUG, MED_KODER);
    expect(u.brandrisk.ob_min).toBe(618);
    expect(u.rader.find(r => r.loneart === "brandrisk_ob")).toMatchObject({ SalaryCode: "147", Number: "10.30", Date: "2026-09-01", EmployeeId: "7" });
    expect(u.rader.filter(r => r.loneart.startsWith("brandrisk"))).toHaveLength(1);                 // en rad, inget nattillägg
    expect(u.lonerader.filter(l => l.loneart.startsWith("brandrisk")).map(l => [l.loneart, l.mangd, l.status])).toEqual([["brandrisk_ob", "10.30", "skickas"]]);
  });

  it("31 aug (06:21–16:49) ger ingen egen OB: lönehanterarens datum är bara dagen månadssumman skrevs på", () => {
    const u = kor([dag("2026-08-31", "06:21:00", null, 628)], MED_KODER);
    expect(u.brandrisk).toEqual({ ob_min: 0, dagar: [] });
    expect(u.rader.some(r => r.loneart.startsWith("brandrisk"))).toBe(false);
  });

  it("de tre morgnarna är dagarna bakom summan", () => {
    expect(kor(STEFAN_AUG).brandrisk.dagar.map(d => d.datum)).toEqual(["2026-08-12", "2026-08-13", "2026-08-14"]);
  });
});

describe("tom kod = ingen rad, en varning och en blockerande saknad kod (som övriga lönearter)", () => {
  it("raden saknar kod: syns som röd rad med mängden, skickas inte", () => {
    const u = kor(STEFAN_AUG);                                     // PROD_KODER har ingen brandrisk-kod
    expect(u.rader.some(r => r.loneart.startsWith("brandrisk"))).toBe(false);
    expect(u.lonerader.filter(l => l.loneart.startsWith("brandrisk")).map(l => [l.loneart, l.mangd, l.status, l.kod])).toEqual([["brandrisk_ob", "10.30", "saknar_kod", null]]);
    expect(u.saknade_loneartskoder).toEqual(["brandrisk_ob"]);
    expect(u.varningar.find(v => /^Löneart saknas för Brandrisk – OB/.test(v))).toMatch(/10\.3 tim/);
  });
});

describe("bara den beordrade brandriskmorgonen — ingen annan OB", () => {
  it("lördag och söndag ger ingen rad, även med svaret ja (helg byggs inte)", () => {
    const u = kor([dag("2026-08-15", "03:00:00", true), dag("2026-08-16", "03:00:00", true)], MED_KODER);
    expect(u.brandrisk.ob_min).toBe(0);
    expect(u.rader.some(r => r.loneart.startsWith("brandrisk"))).toBe(false);
  });

  it("alla beordrade timmar är OB, oavsett klockslag före 06:30: 05:15 → 1,25 tim, 03:00 → 3,50 tim — aldrig en natt-rad", () => {
    expect(kor([dag("2026-08-12", "05:15:00", true)], MED_KODER).rader.find(r => r.loneart === "brandrisk_ob")).toMatchObject({ Number: "1.25" });
    const natt = kor([dag("2026-08-13", "03:00:00", true)], MED_KODER);
    expect(natt.rader.find(r => r.loneart === "brandrisk_ob")).toMatchObject({ Number: "3.50" });
    expect(natt.rader.map(r => r.loneart as string).filter(k => /natt/.test(k))).toEqual([]);
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
    expect(med.rader.length).toBe(utan.rader.length + 1);
  });
});
