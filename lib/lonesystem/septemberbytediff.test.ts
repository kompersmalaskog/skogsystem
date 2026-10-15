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

const arBrandrisk = (key: string) => key.startsWith("brandrisk");

/**
 * Det nya svaret utan de tillägg som inte fanns förut — resten ska vara oförändrat. Tilläggen är brandrisk-OB (2026-10-15): fältet
 * `brandrisk`, de två lönearterna i `saknade_loneartskoder` (tom kod som standard) och deras varningsrader. Inget annat tas bort.
 */
function utanTillagg(u: any) {
  const { kopplingar, ...rest } = u;
  const rad = ({ lonerader, brandrisk, ...r }: any) => ({
    ...r,
    saknade_loneartskoder: r.saknade_loneartskoder.filter((k: string) => !arBrandrisk(k)),
    varningar: r.varningar.filter((v: string) => !/^Löneart saknas för Brandrisk – /.test(v)),
  });
  return { ...rest, resultat: u.resultat.map(rad), berikad: u.berikad.map(rad) };
}

// OB räknat OBEROENDE av koden (ren fixtur-läsning): beordrade (brandrisk_beordrad = true) vardagsmorgnar i arbetsmånaden, start → 06:30,
// och av dem 00:00–05:00. Samma tal som lib/ob ska ge — beräknat här med egna aritmetiken så testet inte bevisar sig självt.
const FIXTUR: any = JSON.parse(readFileSync(join(__dirname, "testdata", "sep2026.json"), "utf8"));
function forvantadOb(medarbetareId: string, arbetsmanad: string) {
  let ob = 0, natt = 0;
  for (const r of FIXTUR.arbetsdag as any[][]) {
    if (r[0] !== medarbetareId || !String(r[1]).startsWith(arbetsmanad) || r[11] !== true || !r[7]) continue;
    const veckodag = new Date(`${r[1]}T12:00:00Z`).getUTCDay();
    if (veckodag < 1 || veckodag > 5) continue;
    const [h, m] = String(r[7]).split(":").map(Number);
    const start = h * 60 + m;
    ob += Math.max(0, 390 - start);
    natt += Math.max(0, 300 - start);
  }
  return { ob, natt };
}
const MED_BRANDRISKKODER = [...PROD_MAPPNING, { intern_typ: "brandrisk_ob", extern_kod: "9001", beskrivning: "Brandrisk – OB" }, { intern_typ: "brandrisk_nattillagg", extern_kod: "9002", beskrivning: "Brandrisk – nattillägg" }];

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
      // brandrisk-OB har tom kod som standard: den syns som en saknad kod, aldrig som en rad — allt annat är som förut
      expect(r.saknade_loneartskoder.filter((k: string) => !arBrandrisk(k))).toEqual([]);
      const ovriga = r.lonerader.filter((l: any) => !arBrandrisk(l.loneart));
      // förhandsvisningens övriga rader är exakt de som skickas: ingen röd, ingen frivillig utan kod
      expect(ovriga.map((l: any) => l.status)).toEqual(ovriga.map(() => "skickas"));
      expect(ovriga.map((l: any) => [l.loneart, l.kod, l.mangd])).toEqual(r.rader.map((x: any) => [x.loneart, x.SalaryCode, x.Number]));
      expect(r.lonerader.filter((l: any) => arBrandrisk(l.loneart)).every((l: any) => l.status === "saknar_kod" && l.kod === null)).toBe(true);
    });
  });
});

describe("brandrisk-OB läggs BARA till (beslut 2026-10-15): två nya rader per förare med beordrade morgnar, resten oförändrat", () => {
  it.each(PERIODER)("$namn: med koder är raderna = de gamla + exakt de två OB-raderna med oberoende räknade timmar", async ({ period }) => {
    const nytt = await beraknaLoneunderlag(sepKlient(MED_BRANDRISKKODER), { period });
    const arbetsmanad = period === "2026-10" ? "2026-09" : "2026-08";
    let antalMedOb = 0;
    nytt.resultat.forEach((r, i) => {
      const gammal = facit[period].resultat[i];
      const { ob, natt } = forvantadOb(r.medarbetare_id, arbetsmanad);
      expect(r.rader.filter((x: any) => !arBrandrisk(x.loneart))).toEqual(gammal.rader);         // alla befintliga rader byte för byte
      const nya = r.rader.filter((x: any) => arBrandrisk(x.loneart)).map((x: any) => [x.loneart, x.SalaryCode, x.Number]);
      const forvantat: any[] = [];
      if (ob > 0) forvantat.push(["brandrisk_ob", "9001", (ob / 60).toFixed(2)]);
      if (natt > 0) forvantat.push(["brandrisk_nattillagg", "9002", (natt / 60).toFixed(2)]);
      expect(nya).toEqual(forvantat);
      if (forvantat.length) antalMedOb++;
      expect(r.saknade_loneartskoder).toEqual([]);
    });
    // augusti har beordrade brandriskmorgnar hos flera förare; september har inga — då är OB-raderna noll och exporten oförändrad
    if (period === "2026-09") expect(antalMedOb).toBeGreaterThanOrEqual(4);
    else expect(antalMedOb).toBe(0);
  });

  it("Stefan i augusti: 10,30 tim OB och 5,80 tim nattillägg (de tre morgnarna 12–14 aug)", async () => {
    const nytt = await beraknaLoneunderlag(sepKlient(MED_BRANDRISKKODER), { period: "2026-09" });
    const medOb = nytt.resultat.filter(r => r.brandrisk.ob_min === 618);
    expect(medOb).toHaveLength(1);
    const stefan = medOb[0];
    expect(stefan.brandrisk.natt_min).toBe(348);
    expect(stefan.brandrisk.dagar.map(d => d.datum)).toEqual(["2026-08-12", "2026-08-13", "2026-08-14"]);
    expect(stefan.rader.filter((x: any) => arBrandrisk(x.loneart)).map((x: any) => [x.loneart, x.Number])).toEqual([["brandrisk_ob", "10.30"], ["brandrisk_nattillagg", "5.80"]]);
  });

  it("utan koder: ingen rad skickas för OB, de syns som saknade koder med samma timmar, och allt annat är som förut", async () => {
    const nytt = await beraknaLoneunderlag(sepKlient(), { period: "2026-09" });
    nytt.resultat.forEach((r, i) => {
      expect(r.rader).toEqual(facit["2026-09"].resultat[i].rader);
      const { ob, natt } = forvantadOb(r.medarbetare_id, "2026-08");
      expect(r.lonerader.filter((l: any) => arBrandrisk(l.loneart)).map((l: any) => [l.loneart, l.mangd, l.status])).toEqual([
        ...(ob > 0 ? [["brandrisk_ob", (ob / 60).toFixed(2), "saknar_kod"]] : []),
        ...(natt > 0 ? [["brandrisk_nattillagg", (natt / 60).toFixed(2), "saknar_kod"]] : []),
      ]);
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
      expect(r.saknade_loneartskoder.filter((k: string) => !arBrandrisk(k))).toEqual([]);
    });
  });
});
