/**
 * BYTE-DIFF: exporten för september 2026 ger EXAKT samma rader före och efter lönearts-bygget (koderna ur databasen, ny helglön/premielogik).
 *
 *  - Underlaget är produktionens augusti–september 2026 (testdata/sep2026.json, pseudonymiserat; kontrollsummor mot databasen 2026-10-15).
 *  - Facit (testdata/sep2026.gammal.json) är utskriften från den GAMLA koden (origin/main före bygget) på samma underlag och samma
 *    sju koder (11, 1355, 1354, 1435, 1436, 136, 821). Den är fryst och regenereras aldrig av den nya koden.
 *  - Den nya `beraknaLoneunderlag` körs på samma underlag. Det som är NYTT (lonerader per förare, kopplingar överst) tas bort, och resten
 *    måste vara identiskt: varje förare, varje rad, varje antal, varje varning, byte för byte.
 *
 * Löneperiod 2026-10 = arbetstid SEPTEMBER 2026 (Fortnox löneperiod ligger en månad efter arbetstiden); 2026-09 = arbetstid augusti.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beraknaLoneunderlag } from "./loneunderlag";
import { sepKlient, PROD_MAPPNING } from "./testdata/sepKlient";

const FACIT = readFileSync(join(__dirname, "testdata", "sep2026.gammal.json"), "utf8");
const facit = JSON.parse(FACIT) as Record<string, any>;

/** Det nya svaret utan de tillägg som inte fanns förut — resten ska vara oförändrat. */
function utanTillagg(u: any) {
  const { kopplingar, ...rest } = u;
  return {
    ...rest,
    resultat: u.resultat.map(({ lonerader, ...r }: any) => r),
    berikad: u.berikad.map(({ lonerader, ...r }: any) => r),
  };
}

const PERIODER = [
  { period: "2026-10", namn: "arbetstid SEPTEMBER 2026 (löneperiod oktober)" },
  { period: "2026-09", namn: "arbetstid augusti 2026 (löneperiod september)" },
];

describe.each(PERIODER)("$namn", ({ period }) => {
  it("exporten är byte för byte densamma som den gamla koden gav", async () => {
    const nytt = utanTillagg(await beraknaLoneunderlag(sepKlient(), { period }));
    expect(JSON.stringify(nytt, null, 1)).toBe(JSON.stringify(facit[period], null, 1));
  });

  it("Fortnox-raderna (löneart, kod, antal, datum) är oförändrade för varje förare, och alla rader skickas", async () => {
    const nytt = await beraknaLoneunderlag(sepKlient(), { period });
    expect(nytt.totalt_rader).toBe(facit[period].totalt_rader);
    nytt.resultat.forEach((r, i) => {
      const gammal = facit[period].resultat[i];
      expect(r.namn).toBe(gammal.namn);
      expect(r.rader).toEqual(gammal.rader);
      expect(r.saknade_loneartskoder).toEqual([]);
      // förhandsvisningens rader är exakt de som skickas: ingen röd, ingen frivillig utan kod
      expect(r.lonerader.map((l: any) => l.status)).toEqual(r.lonerader.map(() => "skickas"));
      expect(r.lonerader.map((l: any) => [l.loneart, l.kod, l.mangd])).toEqual(r.rader.map((x: any) => [x.loneart, x.SalaryCode, x.Number]));
    });
  });
});

describe("kopplingarna bär kod OCH namn ur mappningen", () => {
  it("de sju produktionsraderna, med namnet i Fortnox", async () => {
    const nytt = await beraknaLoneunderlag(sepKlient(), { period: "2026-10" });
    expect(nytt.kopplingar).toEqual({
      timlon: { kod: "11", namn: "Timlön" }, premielon_skordare: { kod: "1355", namn: "Premielön skördare" }, premielon_skotare: { kod: "1354", namn: "Premielön skotare" },
      overtid_skordare: { kod: "1435", namn: "Övertid skördare" }, overtid_skotare: { kod: "1436", namn: "Övertid skotare" }, valtlappar: { kod: "136", namn: "Vältlappar mm" },
      korersattning: { kod: "821", namn: "Körersättning skattefri" },
    });
  });
});

describe("kontroll av jämförelsen själv: den SER en ändring", () => {
  it("en ändrad kod i mappningen ger en annan utskrift (annars bevisar byte-diffen ingenting)", async () => {
    const ändrad = PROD_MAPPNING.map(m => (m.intern_typ === "timlon" ? { ...m, extern_kod: "12" } : m));
    const nytt = utanTillagg(await beraknaLoneunderlag(sepKlient(ändrad), { period: "2026-10" }));
    expect(JSON.stringify(nytt, null, 1)).not.toBe(JSON.stringify(facit["2026-10"], null, 1));
  });

  it("utan premiens koder försvinner bara premieraderna — och inget stoppar (frivillig)", async () => {
    const utanPremie = PROD_MAPPNING.filter(m => !m.intern_typ.startsWith("premielon"));
    const nytt = await beraknaLoneunderlag(sepKlient(utanPremie), { period: "2026-10" });
    nytt.resultat.forEach((r, i) => {
      expect(r.rader).toEqual(facit["2026-10"].resultat[i].rader.filter((x: any) => !x.loneart.startsWith("premielon")));
      expect(r.saknade_loneartskoder).toEqual([]);
    });
  });
});
