/**
 * BYTE-DIFF: exporten för augusti–september 2026 ger EXAKT samma rader före och efter lönearts-bygget (#767) OCH efter helglöns-bygget
 * (närvarokrav, kvalifikationstid, helglön per maskintyp, företagsledare ut ur exporten).
 *
 *  - Underlaget är produktionens augusti–september 2026 (testdata/sep2026.json, pseudonymiserat; kontrollsummor mot databasen 2026-10-15).
 *  - Facit (testdata/sep2026.gammal.json) är utskriften från den GAMLA koden (origin/main före lönearts-bygget) på samma underlag och
 *    samma sju koder (11, 1355, 1354, 1435, 1436, 136, 821). Den är fryst och regenereras aldrig av den nya koden.
 *  - Den nya `beraknaLoneunderlag` körs på samma underlag. Det som är NYTT (lonerader per förare, kopplingar överst, flaggan
 *    foretagsledare, anstallningsdatumSaknas) tas bort, och resten måste vara identiskt: varje förare, varje rad, varje antal,
 *    varje varning, byte för byte.
 *  - AVSIKTLIGT ANNORLUNDA: de två företagsledarna (Förare 2 = Joacim, Förare 3 = Martin i fixturen) får inga lönerader. Testet
 *    nedan räknar upp EXAKT vilka rader som försvinner, och alla andra förare är oförändrade.
 *
 * Löneperiod 2026-10 = arbetstid SEPTEMBER 2026 (Fortnox löneperiod ligger en månad efter arbetstiden); 2026-09 = arbetstid augusti.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beraknaLoneunderlag } from "./loneunderlag";
import { sepKlient, PROD_MAPPNING, FIXTUR_FORETAGSLEDARE } from "./testdata/sepKlient";

const FACIT = readFileSync(join(__dirname, "testdata", "sep2026.gammal.json"), "utf8");
const facit = JSON.parse(FACIT) as Record<string, any>;

/** En rad i svaret utan de tillägg som inte fanns förut — resten ska vara oförändrat. */
function utanTilläggRad({ lonerader, foretagsledare, ...r }: any) {
  const { anstallningsdatumSaknas, ...helglon } = r.helglon || {};
  return { ...r, helglon: r.helglon ? helglon : r.helglon };
}
/** Det nya svaret utan de tillägg som inte fanns förut. */
function utanTillagg(u: any) {
  const { kopplingar, ...rest } = u;
  return { ...rest, resultat: u.resultat.map(utanTilläggRad), berikad: u.berikad.map(utanTilläggRad) };
}

const PERIODER = [
  { period: "2026-10", namn: "arbetstid SEPTEMBER 2026 (löneperiod oktober)" },
  { period: "2026-09", namn: "arbetstid augusti 2026 (löneperiod september)" },
];

describe.each(PERIODER)("$namn", ({ period }) => {
  it("utan företagsledarflagga är exporten byte för byte densamma som den gamla koden gav", async () => {
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

  it("MED företagsledarflaggan (Joacim, Martin): alla andra förare byte för byte oförändrade, ledarna 0 rader", async () => {
    const nytt = await beraknaLoneunderlag(sepKlient(PROD_MAPPNING, FIXTUR_FORETAGSLEDARE), { period });
    const ovriga = (lista: any[]) => lista.filter(r => !FIXTUR_FORETAGSLEDARE.includes(r.medarbetare_id));
    const nyOvriga = ovriga(nytt.resultat).map(utanTilläggRad);
    const gamOvriga = ovriga(facit[period].resultat);
    expect(nyOvriga.length).toBeGreaterThan(0);
    expect(JSON.stringify(nyOvriga, null, 1)).toBe(JSON.stringify(gamOvriga, null, 1));
    for (const r of nytt.resultat.filter(x => FIXTUR_FORETAGSLEDARE.includes(x.medarbetare_id))) {
      expect(r.foretagsledare).toBe(true);
      expect(r.rader).toEqual([]);
      expect(r.lonerader).toEqual([]);
      expect(r.saknade_loneartskoder).toEqual([]);
    }
    expect(nytt.totalt_rader).toBe(gamOvriga.reduce((s: number, r: any) => s + r.rader.length, 0));
  });
});

describe("EXAKT vilka rader som försvinner när företagsledarna lämnar exporten (avsiktligt)", () => {
  const rader = (p: string, id: string) => (facit[p].resultat.find((r: any) => r.medarbetare_id === id)?.rader || []).map((x: any) => `${x.loneart} ${x.SalaryCode} ${x.Number}`);

  it("löneperiod 2026-09 (arbetstid augusti): Förare 2 (Joacim) 2 rader + Förare 3 (Martin) 3 rader = 5 av 25", () => {
    expect(rader("2026-09", "m2")).toEqual(["timlon 11 0.48", "premielon_skordare 1355 0.48"]);
    expect(rader("2026-09", "m3")).toEqual(["timlon 11 57.40", "premielon_skotare 1354 57.40", "valtlappar 136 3"]);
    expect(facit["2026-09"].totalt_rader).toBe(25);
  });
  it("löneperiod 2026-10 (arbetstid september): Förare 3 (Martin) 3 rader = 3 av 27; Joacim hade inga", () => {
    expect(rader("2026-10", "m2")).toEqual([]);
    expect(rader("2026-10", "m3")).toEqual(["timlon 11 128.15", "premielon_skotare 1354 128.15", "valtlappar 136 5"]);
    expect(facit["2026-10"].totalt_rader).toBe(27);
  });
  it("det nya totalet är 20 respektive 24 rader", async () => {
    const u09 = await beraknaLoneunderlag(sepKlient(PROD_MAPPNING, FIXTUR_FORETAGSLEDARE), { period: "2026-09" });
    const u10 = await beraknaLoneunderlag(sepKlient(PROD_MAPPNING, FIXTUR_FORETAGSLEDARE), { period: "2026-10" });
    expect([u09.totalt_rader, u10.totalt_rader]).toEqual([20, 24]);
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

  it("flaggan gör skillnad: samma underlag med och utan flaggan ger olika antal rader", async () => {
    const utan = await beraknaLoneunderlag(sepKlient(), { period: "2026-10" });
    const med = await beraknaLoneunderlag(sepKlient(PROD_MAPPNING, FIXTUR_FORETAGSLEDARE), { period: "2026-10" });
    expect(med.totalt_rader).toBeLessThan(utan.totalt_rader);
  });
});
