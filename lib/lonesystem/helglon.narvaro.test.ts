// Helglön §10 — närvarokrav (mom 4) och kvalifikationstid (mom 3). Regeln är Martins (2026-10-17):
//  - Röd vardag = alltid 8 tim helglön (företagets praxis, över avtalets minimum). Arbetad röd dag: helglön OCH vanlig lön.
//  - PÅ själva dagen bryter sjuk, VAB, föräldraledig och tjänstledig (sjukpenning/föräldrapenning/tjänstledighet, mom 4).
//  - Tjänstledighet som OMGER dagen bryter: närmaste vardag som inte är röd dag, före eller efter. Semester, ATK, komp,
//    föräldraledig, sjuk och VAB dagen före/efter bryter INTE. Olovlig frånvaro byggs inte (ingen frånvarotyp, en dag utan rad är "okänt").
//  - Kvalifikationstid: ingen helglön före anställningsdatum + 3 månader. Saknat datum = helglön betalas (varning visas i beräkningen).
import { describe, it, expect } from "vitest";
import { bedomHelglon, helglonIManad, narmasteVardag, laggTillManader, type FranvaroPost } from "./helglon";

const heldag = (typ: string, startdatum: string, slutdatum = startdatum): FranvaroPost => ({ typ, startdatum, slutdatum });
const deldag = (typ: string, datum: string, fran_tid: string): FranvaroPost => ({ typ, startdatum: datum, slutdatum: datum, fran_tid, till_tid: null });
const u = (o: Partial<{ arbetade: string[]; franvaro: FranvaroPost[]; anstallningsdatum: string | null }> = {}) => ({
  arbetadeDatum: new Set(o.arbetade ?? []), franvaro: o.franvaro ?? [], anstallningsdatum: o.anstallningsdatum ?? null,
});

const JULAFTON = { datum: "2025-12-24", namn: "Julafton" }; // onsdag

describe("grundregeln: röd vardag = 8 tim, även om du arbetar", () => {
  it("vanlig röd vardag utan arbete och utan frånvaro ger helglön", () => {
    expect(bedomHelglon(JULAFTON, u())).toEqual({ ger: true, skal: "betalas" });
  });
  it("ARBETAD röd dag ger helglön ändå (praxis) — och märks som arbetad", () => {
    expect(bedomHelglon(JULAFTON, u({ arbetade: ["2025-12-24"] }))).toEqual({ ger: true, skal: "betalas_arbetad" });
  });
});

describe("mom 4: PÅ själva dagen", () => {
  it.each([["sjuk"], ["vab"], ["foraldraledig"], ["tjanstledig"]])("%s hela röda dagen bryter helglönen", (typ) => {
    expect(bedomHelglon(JULAFTON, u({ franvaro: [heldag(typ, "2025-12-22", "2025-12-26")] }))).toEqual({ ger: false, skal: typ });
  });
  it("sjuk en DEL av dagen bryter också (mom 4: 'dag eller del av dag'), även om du arbetade före", () => {
    expect(bedomHelglon(JULAFTON, u({ arbetade: ["2025-12-24"], franvaro: [deldag("sjuk", "2025-12-24", "10:00")] }))).toEqual({ ger: false, skal: "sjuk" });
  });
  it("arbete vinner över en HELDAGS frånvarorad: arbetad röd dag med sjuk-rad räknas som arbetad", () => {
    expect(bedomHelglon(JULAFTON, u({ arbetade: ["2025-12-24"], franvaro: [heldag("sjuk", "2025-12-24")] }))).toEqual({ ger: true, skal: "betalas_arbetad" });
  });
  it.each([["semester"], ["atk"], ["komp"], ["permission"]])("%s på röda dagen bryter inte (intjänad ledighet)", (typ) => {
    expect(bedomHelglon(JULAFTON, u({ franvaro: [heldag(typ, "2025-12-24")] })).ger).toBe(true);
  });
});

describe("mom 4: dagen före/efter — bara tjänstledighet bryter (facit: Daniel semester, Max föräldraledig)", () => {
  it("semester dagen före (Daniel 30 dec → nyårsafton 31 dec) bryter inte", () => {
    expect(bedomHelglon({ datum: "2025-12-31", namn: "Nyårsafton" }, u({ franvaro: [heldag("semester", "2025-12-29", "2025-12-30")] }))).toEqual({ ger: true, skal: "betalas" });
  });
  it("semester dagen efter (2 jan efter nyårsdagen) bryter inte", () => {
    expect(bedomHelglon({ datum: "2026-01-01", namn: "Nyårsdagen" }, u({ franvaro: [heldag("semester", "2026-01-02")] })).ger).toBe(true);
  });
  it("föräldraledig dagen före (Max 22–23 dec → julafton) och efter (7 jan efter trettondagen) bryter inte", () => {
    expect(bedomHelglon(JULAFTON, u({ franvaro: [heldag("foraldraledig", "2025-12-22", "2025-12-23")] })).ger).toBe(true);
    expect(bedomHelglon({ datum: "2026-01-06", namn: "Trettondagen" }, u({ franvaro: [heldag("foraldraledig", "2026-01-07")] })).ger).toBe(true);
  });
  it.each([["sjuk"], ["vab"], ["atk"], ["komp"]])("%s dagen före bryter inte", (typ) => {
    expect(bedomHelglon(JULAFTON, u({ franvaro: [heldag(typ, "2025-12-23")] })).ger).toBe(true);
  });
  it("tjänstledig dagen FÖRE bryter", () => {
    expect(bedomHelglon(JULAFTON, u({ franvaro: [heldag("tjanstledig", "2025-12-23")] }))).toEqual({ ger: false, skal: "tjanstledig_omger" });
  });
  it("tjänstledig dagen EFTER bryter: närmaste vardag efter julafton är måndag 29 dec (25–26 röda, 27–28 helg)", () => {
    expect(bedomHelglon(JULAFTON, u({ franvaro: [heldag("tjanstledig", "2025-12-29")] }))).toEqual({ ger: false, skal: "tjanstledig_omger" });
  });
  it("tjänstledig på en helgdag eller en annan röd dag mellan räknas inte som 'närmaste vardag'", () => {
    // 27–28 dec är lördag/söndag och 25–26 är röda: ingen av dem är arbetsdagen efter julafton
    expect(bedomHelglon(JULAFTON, u({ franvaro: [heldag("tjanstledig", "2025-12-25", "2025-12-28")] })).ger).toBe(true);
  });
  it("över månadsskiftet: närmaste vardag före 1 jan är 30 dec (31 dec är röd)", () => {
    const nyar = { datum: "2026-01-01", namn: "Nyårsdagen" };
    expect(bedomHelglon(nyar, u({ franvaro: [heldag("tjanstledig", "2025-12-30")] })).skal).toBe("tjanstledig_omger");
    expect(bedomHelglon(nyar, u({ franvaro: [heldag("tjanstledig", "2025-12-31")] })).ger).toBe(true);
  });
  it("annandag påsk 2026-04-06: närmaste vardag före är torsdag 2 april (långfredag 3 april är röd, 4–5 helg)", () => {
    const annandag = { datum: "2026-04-06", namn: "Annandag påsk" };
    expect(bedomHelglon(annandag, u({ franvaro: [heldag("tjanstledig", "2026-04-02")] })).skal).toBe("tjanstledig_omger");
    expect(bedomHelglon(annandag, u({ franvaro: [heldag("tjanstledig", "2026-04-04", "2026-04-05")] })).ger).toBe(true);
  });
  it("tjänstledig en DEL av dagen före bryter inte (bara hela dagar 'omger' helgdagen)", () => {
    expect(bedomHelglon(JULAFTON, u({ franvaro: [deldag("tjanstledig", "2025-12-23", "13:00")] })).ger).toBe(true);
  });
  it("tjänstledig som täcker själva dagen sägs vara tjänstledig (inte 'omger')", () => {
    expect(bedomHelglon(JULAFTON, u({ franvaro: [heldag("tjanstledig", "2025-12-22", "2025-12-28")] })).skal).toBe("tjanstledig");
  });
  it("tjänstledig dagen före, men du arbetade på dagen före-dagen? (frånvarorad + arbete samma dag) — arbete vinner, bryter inte", () => {
    expect(bedomHelglon(JULAFTON, u({ arbetade: ["2025-12-23"], franvaro: [heldag("tjanstledig", "2025-12-23")] })).ger).toBe(true);
  });
});

describe("mom 3: kvalifikationstid — ingen helglön de tre första anställningsmånaderna", () => {
  it("anställd 1 dec 2025: ingen helglön 24 dec", () => {
    expect(bedomHelglon(JULAFTON, u({ anstallningsdatum: "2025-12-01" }))).toEqual({ ger: false, skal: "kvalifikationstid" });
  });
  it("gränsen: anställd 24 sep → första dagen EFTER tre månader är 24 dec → helglön; anställd 25 sep → ingen", () => {
    expect(bedomHelglon(JULAFTON, u({ anstallningsdatum: "2025-09-24" })).ger).toBe(true);
    expect(bedomHelglon(JULAFTON, u({ anstallningsdatum: "2025-09-25" })).ger).toBe(false);
  });
  it("saknat anställningsdatum: ingen gissning och ingen avstängning — helglön betalas", () => {
    expect(bedomHelglon(JULAFTON, u({ anstallningsdatum: null })).ger).toBe(true);
  });
  it("kvalifikationstiden går före närvarokravet (en nyanställd som är sjuk är 'ny', inte 'sjuk')", () => {
    expect(bedomHelglon(JULAFTON, u({ anstallningsdatum: "2025-12-01", franvaro: [heldag("sjuk", "2025-12-24")] })).skal).toBe("kvalifikationstid");
  });
});

describe("hjälpare", () => {
  it("laggTillManader klipper till månadens sista dag (30 nov + 3 mån = 28 feb)", () => {
    expect(laggTillManader("2025-11-30", 3)).toBe("2026-02-28");
    expect(laggTillManader("2025-09-24", 3)).toBe("2025-12-24");
    expect(laggTillManader("2025-11-30", 15)).toBe("2027-02-28");
  });
  it("narmasteVardag hoppar över helger och röda dagar åt båda håll", () => {
    expect(narmasteVardag("2025-12-24", -1)).toBe("2025-12-23");
    expect(narmasteVardag("2025-12-24", +1)).toBe("2025-12-29");
    expect(narmasteVardag("2026-01-01", -1)).toBe("2025-12-30");
    expect(narmasteVardag("2026-04-06", -1)).toBe("2026-04-02");
  });
});

describe("helglonIManad: en bedömning per röd vardag i avtalets lista", () => {
  it("december 2025: 24, 25, 26 och 31 dec (alla vardagar) — var och en bedömd", () => {
    const d = helglonIManad(null, "2025-12", u({ arbetade: ["2025-12-25"], franvaro: [heldag("sjuk", "2025-12-26")] }));
    expect(d.map(x => [x.datum, x.ger, x.skal])).toEqual([
      ["2025-12-24", true, "betalas"], ["2025-12-25", true, "betalas_arbetad"], ["2025-12-26", false, "sjuk"], ["2025-12-31", true, "betalas"],
    ]);
    expect(d[1].arbetad).toBe(true);
  });
  it("januari 2026: nyårsdagen och trettondagen", () => {
    expect(helglonIManad(null, "2026-01", u()).map(x => x.datum)).toEqual(["2026-01-01", "2026-01-06"]);
  });
  it("lördagar och söndagar ger ingen helglön (juldagen 2027 är lördag, annandag jul söndag)", () => {
    expect(helglonIManad(null, "2027-12", u()).map(x => x.datum)).toEqual(["2027-12-24", "2027-12-31"]);
  });
});
