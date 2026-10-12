import { describe, it, expect } from "vitest";
import {
  veckoText, antalVeckor, arLangPeriod, veckoRader, veckoFonster, tryckVecka, arIUrval, periodSammanfattning, krockarIVecka, krockarIUrval,
  krockText, krockMening, periodNamn, slutFranMandag, kontrolleraPeriod, delaUpp, loneperioderBerorda, arExporterad, mandagFranSlut,
  MAX_VECKOR_UTAN_ÖVERENSKOMMELSE, MAX_NAMN_TECKEN,
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

describe("veckoRader: en rad per hel vecka mellan två datum, måndag som värde, grupperad på månad", () => {
  const rader = veckoRader("2026-10-12", "2027-01-10");
  it("börjar måndagen i veckan som innehåller första datumet och slutar i veckan som innehåller sista, utan hål", () => {
    expect(rader[0].mandag).toBe("2026-10-12");
    expect(veckoRader("2026-10-14", "2026-10-14").map(r => r.mandag)).toEqual(["2026-10-12"]);
    expect(rader[rader.length - 1].mandag).toBe("2027-01-04");
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
});

describe("veckoFonster: ca sex månader framåt och några veckor bakåt runt det som är valt — knappar tar fram mer", () => {
  it("utan val: från 6 veckor före veckan vi är i till 26 veckor efter", () => {
    expect(veckoFonster({ forsta: "", sista: "" }, "2026-10-12", 0, 0)).toEqual({ fran: "2026-08-31", till: "2027-04-12" });
  });
  it("med val: runt valet i stället för runt idag (en period man ändrar ska synas direkt)", () => {
    expect(veckoFonster({ forsta: "2026-04-20", sista: "2026-06-29" }, "2026-10-12", 0, 0)).toEqual({ fran: "2026-03-09", till: "2026-12-28" });
    expect(veckoFonster({ forsta: "2026-04-20", sista: "" }, "2026-10-12", 0, 0)).toEqual({ fran: "2026-03-09", till: "2026-10-19" });
  });
  it("varje tryck på Tidigare/Senare lägger till 26 veckor", () => {
    expect(veckoFonster({ forsta: "", sista: "" }, "2026-10-12", 1, 0)).toEqual({ fran: "2026-03-02", till: "2027-04-12" });
    expect(veckoFonster({ forsta: "", sista: "" }, "2026-10-12", 0, 2)).toEqual({ fran: "2026-08-31", till: "2028-04-10" });
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

describe("periodNamn: namnet, och för en rad som saknar det de första orden i anteckningen", () => {
  it("namn vinner; annars anteckningens första ord upp till 20 tecken; annars 'Period'", () => {
    expect(periodNamn({ namn: " Gävle ", anteckning: "Gävle/Hedemora–Sandviken 22 apr" })).toBe("Gävle");
    expect(periodNamn({ namn: null, anteckning: "Gävle/Hedemora–Sandviken 22 apr–29 jun 2026" })).toBe("Gävle/Hedemora–Sandv");
    expect(periodNamn({ namn: "", anteckning: "Hela laget" })).toBe("Hela laget");
    expect(periodNamn({ anteckning: "  " })).toBe("Period");
    expect(MAX_NAMN_TECKEN).toBe(20);
  });
});

describe("krockar: veckor som redan ligger i en period för någon av de valda förarna (varning, aldrig spärr)", () => {
  const p = (id: string, namn: string, s: string, e: string, med: string | null, anteckning = "lång anteckning") => ({ id, namn, startdatum: s, slutdatum: e, medarbetare_id: med, anteckning });
  const GAVLE = p("gavle", "Gävle", "2026-04-20", "2026-07-05", null);
  const ANNA = p("anna", "Anna", "2026-10-05", "2026-10-18", "m1");
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
  it("samma namn och samma veckor är inte en krock: det är samma period för andra förare", () => {
    const ny = { namn: "gävle", startdatum: "2026-04-20", slutdatum: "2026-07-05" };           // skiftläge spelar ingen roll
    expect(krockarIVecka("2026-04-27", { alla: false, ids: ["m2"] }, alla, undefined, ny)).toEqual([]);
    expect(krockarIUrval({ forsta: "2026-04-20", sista: "2026-06-29" }, { alla: false, ids: ["m2"] }, alla, undefined, ny)).toEqual([]);
    // annat namn eller andra veckor = krock
    expect(krockarIVecka("2026-04-27", { alla: false, ids: ["m2"] }, alla, undefined, { ...ny, namn: "Annat" }).map(k => k.id)).toEqual(["gavle"]);
    expect(krockarIVecka("2026-04-27", { alla: false, ids: ["m2"] }, alla, undefined, { ...ny, slutdatum: "2026-06-28" }).map(k => k.id)).toEqual(["gavle"]);
  });
  it("krockText: periodens NAMN (inte anteckningen), och '+N' när flera ligger över varandra", () => {
    expect(krockText([GAVLE])).toBe("Gävle");
    expect(krockText([GAVLE, ANNA])).toBe("Gävle +1");
    expect(krockText([])).toBe("");
    expect(krockText([{ namn: null, anteckning: "Hela laget" }])).toBe("Hela laget");
  });
  it("krockarIUrval: varje period en gång, tidigast först", () => {
    const k = krockarIUrval({ forsta: "2026-04-13", sista: "2026-10-12" }, { alla: true, ids: [] }, alla);
    expect(k.map(x => x.id)).toEqual(["gavle", "anna"]);
    expect(krockarIUrval({ forsta: "2026-08-03", sista: "2026-08-10" }, { alla: true, ids: [] }, alla)).toEqual([]);
  });
});

describe("krockMening: EN rad — 'Krockar med Gävle v17–27 (Joacim, Daniel, Stefan, Martin)'", () => {
  const p = (id: string, namn: string, med: string | null, s = "2026-04-20", e = "2026-07-05") => ({ id, namn, startdatum: s, slutdatum: e, medarbetare_id: med, anteckning: "en mycket lång anteckning som aldrig ska upprepas" });
  const fornamn = (id: string | null) => ({ j: "Joacim", d: "Daniel", s: "Stefan", m: "Martin" } as Record<string, string>)[id || ""] || "?";
  it("samma period för flera förare slås ihop till en post med förarnas förnamn", () => {
    expect(krockMening([p("1", "Gävle", "j"), p("2", "Gävle", "d"), p("3", "Gävle", "s"), p("4", "Gävle", "m")], fornamn))
      .toBe("Krockar med Gävle v17–27 (Joacim, Daniel, Stefan, Martin)");
  });
  it("en period för alla: '(alla)'; anteckningen står aldrig med", () => {
    const t = krockMening([p("1", "Gävle", null)], fornamn);
    expect(t).toBe("Krockar med Gävle v17–27 (alla)");
    expect(t).not.toContain("anteckning");
  });
  it("olika perioder skiljs med komma, fortfarande en rad (inget radbrytande tecken)", () => {
    const t = krockMening([p("1", "Gävle", "j"), p("2", "Vinter", null, "2026-11-02", "2026-11-15")], fornamn);
    expect(t).toBe("Krockar med Gävle v17–27 (Joacim), Vinter v45–46 (alla)");
    expect(t).not.toContain("\n");
  });
  it("ingen krock: tom text", () => { expect(krockMening([], fornamn)).toBe(""); });
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
  const ok = { forsta: "2026-04-20", sista: "2026-07-01", namn: "Gävle" };
  it("giltig period ger inget fel — anteckningen är valfri och ingår inte", () => { expect(kontrolleraPeriod(ok)).toBeNull(); });
  it("sista veckan före första: fel", () => { expect(kontrolleraPeriod({ ...ok, sista: "2026-04-13" })).toMatch(/före/); });
  it("namn saknas eller är bara blanksteg: fel; 20 tecken går, 21 gör det inte", () => {
    for (const n of ["", "   "]) expect(kontrolleraPeriod({ ...ok, namn: n }), n).toMatch(/namn/i);
    expect(kontrolleraPeriod({ ...ok, namn: "a".repeat(20) })).toBeNull();
    expect(kontrolleraPeriod({ ...ok, namn: "a".repeat(21) })).toMatch(/20 tecken/);
    expect(kontrolleraPeriod({ ...ok, namn: "  Gävle  " })).toBeNull();
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
