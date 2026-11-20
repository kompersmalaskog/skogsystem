// Fortnox-namnen för koderna vi använder — bara ett FÖRSLAG i formuläret Lön → Lönearter (namnet fylls i när koden skrivs).
// Tabellen avgör aldrig vilken löneart som får vilken kod (det gör lonesystem_artikelmappning) och exporten läser den aldrig.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FORTNOX_LONEARTSNAMN, fortnoxNamnForKod } from "./fortnoxNamn";

const rot = join(__dirname, "..", "..");
const las = (rel: string) => readFileSync(join(rot, rel), "utf8");

describe("fortnoxNamnForKod", () => {
  it("exakt de tio koderna appen använder, alla med ett namn", () => {
    expect(Object.keys(FORTNOX_LONEARTSNAMN).sort()).toEqual(["11", "136", "1354", "1355", "1435", "1436", "1461", "1462", "147", "821"].sort());
    for (const [kod, namn] of Object.entries(FORTNOX_LONEARTSNAMN)) expect(namn.trim(), kod).not.toBe("");
  });
  it("namnen som Martin läst i Fortnox (147, 1461, 1462) och som står i produktionens mappning (resten)", () => {
    expect(fortnoxNamnForKod("147")).toBe("OB tillägg natt");
    expect(fortnoxNamnForKod("1461")).toBe("Helglön, timmar");
    expect(fortnoxNamnForKod("1462")).toBe("Helglön, timmar 2");
    expect(fortnoxNamnForKod("11")).toBe("Timlön");
    expect(fortnoxNamnForKod("136")).toBe("Vältlappar mm");
    expect(fortnoxNamnForKod("821")).toBe("Körersättning skattefri");
    expect(fortnoxNamnForKod("1354")).toBe("Premielön skotare");
    expect(fortnoxNamnForKod("1355")).toBe("Premielön skördare");
    expect(fortnoxNamnForKod("1435")).toBe("Övertid skördare");
    expect(fortnoxNamnForKod("1436")).toBe("Övertid skotare");
  });
  it("blanksteg runt koden spelar ingen roll; okänd eller tom kod ger tomt, aldrig en gissning", () => {
    expect(fortnoxNamnForKod(" 147 ")).toBe("OB tillägg natt");
    expect(fortnoxNamnForKod("999")).toBe("");
    expect(fortnoxNamnForKod("")).toBe("");
    expect(fortnoxNamnForKod("toString")).toBe("");   // inget som ärvs från Object
    expect(fortnoxNamnForKod(undefined as any)).toBe("");
  });
});

describe("vakt: tabellen är ett förslag i formuläret, inget mer", () => {
  it("varken beräkningen, exporten eller katalogen läser den", () => {
    for (const fil of ["lib/lonesystem/loneberakning.ts", "lib/lonesystem/loneart.ts", "lib/lonesystem/loneunderlag.ts", "app/api/fortnox/salary-export/route.ts"]) {
      expect(las(fil), fil).not.toContain("fortnoxNamn");
    }
  });
  it("formuläret använder den", () => {
    expect(las("components/admin/LonearterUnderflik.tsx")).toContain("fortnoxNamnForKod");
  });
});
