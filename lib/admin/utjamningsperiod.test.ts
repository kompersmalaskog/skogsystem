import { describe, it, expect } from "vitest";
import {
  veckoText, antalVeckor, arLangPeriod, veckoRader, tryckVecka, arIUrval, periodSammanfattning, krockarIVecka, krockarIUrval, krockText, slutFranMandag, kontrolleraPeriod, delaUpp,
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

describe("veckoRader: en rad per hela vecka, måndag som värde, grupperad på månad", () => {
  const rader = veckoRader(2026);
  it("börjar måndagen i v1 året före (2024-12-30) och slutar söndagen i sista veckan året efter, utan hål", () => {
    expect(rader[0].mandag).toBe("2024-12-30");
    const sista = rader[rader.length - 1];
    expect(slutFranMandag(sista.mandag) >= "2027-12-31").toBe(true);
    for (let i = 0; i < rader.length; i++) {
      const [y, m, d] = rader[i].mandag.split("-").map(Number);
      expect(new Date(y, m - 1, d).getDay()).toBe(1);
      if (i > 0) {
        const [y0, m0, d0] = rader[i - 1].mandag.split("-").map(Number);
        expect(Math.round((new Date(y, m - 1, d).getTime() - new Date(y0, m0 - 1, d0).getTime()) / 86400000)).toBe(7);   // avrundat: sommartid ger en 23-timmarsvecka
      }
    }
  });
  it("etiketten är 'v44 · 26 okt–1 nov' över månadsskifte och 'v43 · 19–25 okt' inom en månad (årtalet står på månadsrubriken)", () => {
    expect(rader.find(r => r.mandag === "2026-10-26")!.etikett).toBe("v44 · 26 okt–1 nov");
    expect(rader.find(r => r.mandag === "2026-10-19")!.etikett).toBe("v43 · 19–25 okt");
  });
  it("veckan hör till måndagens månad: 28 dec 2026–3 jan 2027 ligger under december 2026", () => {
    const r = rader.find(r => r.mandag === "2026-12-28")!;
    expect(r.manad).toBe("2026-12");
    expect(r.manadText).toBe("december 2026");
    expect(r.vecka).toBe(53);
  });
  it("extra datum utanför fönstret tas med: en period från 2022 går att öppna", () => {
    expect(veckoRader(2026, ["2022-03-09"])[0].mandag).toBe("2022-03-07");
    expect(veckoRader(2026, ["2030-01-01"]).some(r => r.mandag === "2029-12-31")).toBe(true);
  });
});

describe("tryckVecka: första veckan, sista veckan, tryck igen = börja om", () => {
  const tom = { forsta: "", sista: "" };
  it("första trycket sätter bara första veckan", () => {
    expect(tryckVecka(tom, "2026-10-26")).toEqual({ forsta: "2026-10-26", sista: "" });
  });
  it("andra trycket efter sätter sista veckan; samma vecka = en vecka", () => {
    expect(tryckVecka({ forsta: "2026-10-26", sista: "" }, "2026-12-21")).toEqual({ forsta: "2026-10-26", sista: "2026-12-21" });
    expect(tryckVecka({ forsta: "2026-10-26", sista: "" }, "2026-10-26")).toEqual({ forsta: "2026-10-26", sista: "2026-10-26" });
  });
  it("andra trycket före den första byter plats i stället för att ge ett fel", () => {
    expect(tryckVecka({ forsta: "2026-10-26", sista: "" }, "2026-10-12")).toEqual({ forsta: "2026-10-12", sista: "2026-10-26" });
  });
  it("tredje trycket börjar om", () => {
    expect(tryckVecka({ forsta: "2026-10-26", sista: "2026-12-21" }, "2026-11-09")).toEqual({ forsta: "2026-11-09", sista: "" });
  });
  it("arIUrval: allt mellan första och sista är markerat, också när bara första är vald", () => {
    const u = { forsta: "2026-10-26", sista: "2026-11-09" };
    expect(["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"].map(m => arIUrval(u, m))).toEqual([false, true, true, true, false]);
    expect(arIUrval({ forsta: "2026-10-26", sista: "" }, "2026-10-26")).toBe(true);
    expect(arIUrval({ forsta: "2026-10-26", sista: "" }, "2026-11-02")).toBe(false);
    expect(arIUrval(tom, "2026-10-26")).toBe(false);
  });
});

describe("periodSammanfattning: '9 veckor, v44–52 2026'", () => {
  it("antal veckor och veckospann med årtal; en vecka i singular; över årsskifte med båda åren", () => {
    expect(periodSammanfattning("2026-10-26", "2026-12-21")).toBe("9 veckor, v44–52 2026");
    expect(periodSammanfattning("2026-10-26", "2026-10-26")).toBe("1 vecka, v44 2026");
    expect(periodSammanfattning("2026-12-14", "2027-01-18")).toBe("6 veckor, v51 2026 – v3 2027");
  });
  it("bara första veckan vald: ber om den sista", () => {
    expect(periodSammanfattning("2026-10-26", "")).toBe("Från v44 2026. Tryck på sista veckan.");
    expect(periodSammanfattning("", "")).toBe("Tryck på första veckan.");
  });
});

describe("krockar: veckor som redan ligger i en period för någon av de valda förarna (varning, aldrig spärr)", () => {
  const p = (id: string, s: string, e: string, med: string | null, anteckning = id) => ({ id, startdatum: s, slutdatum: e, medarbetare_id: med, anteckning });
  const GAVLE = p("gavle", "2026-04-20", "2026-07-05", null, "Gävle");
  const ANNA = p("anna", "2026-10-05", "2026-10-18", "m1", "Anna, skogsbruksplan");
  const alla = [GAVLE, ANNA];
  it("en period för alla krockar med varje urval; en personlig period bara med den personen eller med Alla", () => {
    expect(krockarIVecka("2026-04-27", { alla: false, ids: ["m2"] }, alla).map(k => k.id)).toEqual(["gavle"]);
    expect(krockarIVecka("2026-10-05", { alla: false, ids: ["m2"] }, alla)).toEqual([]);
    expect(krockarIVecka("2026-10-05", { alla: false, ids: ["m1", "m2"] }, alla).map(k => k.id)).toEqual(["anna"]);
    expect(krockarIVecka("2026-10-05", { alla: true, ids: [] }, alla).map(k => k.id)).toEqual(["anna"]);
  });
  it("ingen förare vald: ingenting krockar (inte ens en period för alla)", () => {
    expect(krockarIVecka("2026-04-27", { alla: false, ids: [] }, alla)).toEqual([]);
    expect(krockarIUrval({ forsta: "2026-04-20", sista: "2026-04-27" }, { alla: false, ids: [] }, alla)).toEqual([]);
  });
  it("veckan måste ligga i perioden: måndagen efter söndagen krockar inte", () => {
    expect(krockarIVecka("2026-07-06", { alla: true, ids: [] }, alla)).toEqual([]);
    expect(krockarIVecka("2026-06-29", { alla: true, ids: [] }, alla).map(k => k.id)).toEqual(["gavle"]);
  });
  it("den period man ändrar krockar inte med sig själv", () => {
    expect(krockarIVecka("2026-10-05", { alla: false, ids: ["m1"] }, alla, "anna")).toEqual([]);
  });
  it("krockText: periodens anteckning, och '+N' när flera ligger över varandra", () => {
    expect(krockText([GAVLE])).toBe("Gävle");
    expect(krockText([GAVLE, ANNA])).toBe("Gävle +1");
    expect(krockText([])).toBe("");
  });
  it("krockarIUrval: varje period en gång, tidigast först", () => {
    const k = krockarIUrval({ forsta: "2026-04-13", sista: "2026-10-12" }, { alla: true, ids: [] }, alla);
    expect(k.map(x => x.id)).toEqual(["gavle", "anna"]);
    expect(krockarIUrval({ forsta: "2026-08-03", sista: "2026-08-10" }, { alla: true, ids: [] }, alla)).toEqual([]);
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
  it("ingen förare vald: fel (Alla räknas som en vald)", () => {
    expect(kontrolleraPeriod({ ...ok, antalForare: 0 })).toMatch(/förare/i);
    expect(kontrolleraPeriod({ ...ok, antalForare: 1 })).toBeNull();
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
