import { describe, it, expect } from "vitest";
import {
  veckoText, antalVeckor, arLangPeriod, veckoAlternativ, slutFranMandag, kontrolleraPeriod, delaUpp,
  loneperioderBerorda, arExporterad, mandagFranSlut, MAX_VECKOR_UTAN_ÖVERENSKOMMELSE,
} from "./utjamningsperiod";

describe("veckoText: v17–27 ur startdatum och slutdatum (ISO-veckor)", () => {
  it.each([
    [{ startdatum: "2026-04-20", slutdatum: "2026-07-05" }, "v17–27"],
    [{ startdatum: "2026-04-20", slutdatum: "2026-04-26" }, "v17"],
    [{ startdatum: "2026-12-14", slutdatum: "2027-01-24" }, "v51 2026 – v3 2027"],
    [{ startdatum: "2025-12-29", slutdatum: "2026-01-04" }, "v1"],
  ])("%j → %s", (p, t) => { expect(veckoText(p)).toBe(t); });
});

describe("antalVeckor och gränsen 16 veckor (§5 mom 2)", () => {
  it("v17–27 = 11 veckor; en vecka = 1; 16 veckor är inte längre än 16", () => {
    expect(antalVeckor({ startdatum: "2026-04-20", slutdatum: "2026-07-05" })).toBe(11);
    expect(antalVeckor({ startdatum: "2026-04-20", slutdatum: "2026-04-26" })).toBe(1);
    expect(antalVeckor({ startdatum: "2026-01-05", slutdatum: "2026-04-26" })).toBe(16);
    expect(MAX_VECKOR_UTAN_ÖVERENSKOMMELSE).toBe(16);
    expect(arLangPeriod({ startdatum: "2026-01-05", slutdatum: "2026-04-26" })).toBe(false);
    expect(arLangPeriod({ startdatum: "2026-01-05", slutdatum: "2026-05-03" })).toBe(true);   // 17 veckor
  });
});

describe("veckoAlternativ: bara hela veckor, måndag som värde", () => {
  const alt = veckoAlternativ(2026);
  it("börjar på måndagen i v1 året före och slutar året efter; varje värde är en måndag", () => {
    expect(alt[0].value).toBe("2024-12-30");           // måndagen i ISO-vecka 1 2025 (året före 2026)
  });
  it("2026: v17 är måndagen 20 april och har en läsbar etikett", () => {
    const v17 = alt.find(a => a.value === "2026-04-20")!;
    expect(v17.label).toBe("v17 2026 · 20–26 apr");
  });
  it("etikett över månadsskifte: v14 2026 = 30 mar–5 apr", () => {
    expect(alt.find(a => a.value === "2026-03-30")!.label).toBe("v14 2026 · 30 mar–5 apr");
  });
  it("alla värden är måndagar i stigande ordning, utan hål", () => {
    for (let i = 0; i < alt.length; i++) {
      const [y, m, d] = alt[i].value.split("-").map(Number);
      expect(new Date(y, m - 1, d).getDay()).toBe(1);
      if (i > 0) {
        const [y0, m0, d0] = alt[i - 1].value.split("-").map(Number);
        expect(Math.round((new Date(y, m - 1, d).getTime() - new Date(y0, m0 - 1, d0).getTime()) / 86400000)).toBe(7);   // avrundat: sommartid ger en 23-timmarsvecka
      }
    }
  });
});

describe("slutFranMandag: söndagen i veckan", () => {
  it("20 april → 26 april; över månadsskifte och årsskifte", () => {
    expect(slutFranMandag("2026-04-20")).toBe("2026-04-26");
    expect(slutFranMandag("2026-03-30")).toBe("2026-04-05");
    expect(slutFranMandag("2026-12-28")).toBe("2027-01-03");
  });
});

describe("mandagFranSlut: omvänt mot slutFranMandag", () => {
  it("söndag → måndag i samma vecka, också över månads- och årsskifte", () => {
    expect(mandagFranSlut("2026-10-18")).toBe("2026-10-12");
    expect(mandagFranSlut("2027-01-03")).toBe("2026-12-28");
    expect(slutFranMandag(mandagFranSlut("2026-07-05"))).toBe("2026-07-05");
  });
});

describe("kontrolleraPeriod: det som spärrar Spara", () => {
  const ok = { forsta: "2026-04-20", sista: "2026-07-01", anteckning: "Gävle, ordinarie tid utlagd ojämnt" };
  it("giltig period ger inget fel", () => { expect(kontrolleraPeriod(ok)).toBeNull(); });
  it("sista veckan före första: fel", () => { expect(kontrolleraPeriod({ ...ok, sista: "2026-04-13" })).toMatch(/före/); });
  it("anteckning saknas eller är för kort: fel (minst 3 tecken, en bokstav eller siffra)", () => {
    for (const a of ["", "  ", "..", "ab", "!!!"]) expect(kontrolleraPeriod({ ...ok, anteckning: a }), a).toMatch(/anteckning/i);
    expect(kontrolleraPeriod({ ...ok, anteckning: "Gävle" })).toBeNull();
  });
  it("vecka ej vald: fel", () => { expect(kontrolleraPeriod({ ...ok, forsta: "" })).toMatch(/vecka/i); });
});

describe("delaUpp: kommande och pågående överst, avslutade under", () => {
  const p = (id: string, s: string, e: string) => ({ id, startdatum: s, slutdatum: e });
  it("pågående/kommande efter startdatum stigande; avslutade senast slut först", () => {
    const { kommande, avslutade } = delaUpp([
      p("gavle", "2026-04-20", "2026-07-05"), p("senare", "2026-11-02", "2026-11-15"), p("nu", "2026-10-05", "2026-10-18"), p("aldre", "2026-01-05", "2026-01-18"),
    ], "2026-10-09");
    expect(kommande.map(x => x.id)).toEqual(["nu", "senare"]);
    expect(avslutade.map(x => x.id)).toEqual(["gavle", "aldre"]);
  });
  it("en period som slutar IDAG är fortfarande pågående", () => {
    expect(delaUpp([p("a", "2026-10-05", "2026-10-11")], "2026-10-11").kommande).toHaveLength(1);
    expect(delaUpp([p("a", "2026-10-05", "2026-10-11")], "2026-10-12").avslutade).toHaveLength(1);
  });
});

describe("exporterade löneperioder: perioden får inte tas bort om lönen den berör är skickad", () => {
  it("löneperiod = arbetsmånad + 1: v17–27 (20/4–5/7) berör arbetsmånaderna apr–jul → lön maj–aug", () => {
    expect(loneperioderBerorda({ startdatum: "2026-04-20", slutdatum: "2026-07-05" })).toEqual(["2026-05", "2026-06", "2026-07", "2026-08"]);
  });
  it("en vecka i slutet av december berör arbetsmånad december → lön januari nästa år", () => {
    expect(loneperioderBerorda({ startdatum: "2026-12-28", slutdatum: "2027-01-03" })).toEqual(["2027-01", "2027-02"]);
  });
  const gavle = { startdatum: "2026-04-20", slutdatum: "2026-07-05", medarbetare_id: null };
  it("alla-period: skickad lön för någon förare i en berörd löneperiod spärrar", () => {
    expect(arExporterad(gavle, [{ period: "2026-06", medarbetare_id: "s", status: "skickat" }])).toBe(true);
  });
  it("utkast, fel eller en period utanför berörda månader spärrar inte", () => {
    expect(arExporterad(gavle, [{ period: "2026-06", medarbetare_id: "s", status: "utkast" }, { period: "2026-09", medarbetare_id: "s", status: "skickat" }, { period: "2026-04", medarbetare_id: "s", status: "skickat" }])).toBe(false);
  });
  it("personlig period spärras bara av den personens skickade lön", () => {
    const egen = { ...gavle, medarbetare_id: "m" };
    expect(arExporterad(egen, [{ period: "2026-06", medarbetare_id: "s", status: "skickat" }])).toBe(false);
    expect(arExporterad(egen, [{ period: "2026-06", medarbetare_id: "m", status: "skickat" }])).toBe(true);
  });
});
