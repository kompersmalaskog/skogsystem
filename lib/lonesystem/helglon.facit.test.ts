// FACIT FRÅN FORTNOX (läst 2026-10-17): vad som faktiskt betalades som helglön i dec 2025 och jan 2026.
//   - Skördare fick löneart 1461 "Helglön, timmar", skotare 1462 "Helglön, timmar 2". 8 tim per röd vardag.
//   - Stefan, Oskar, Daniel och Max fick FULL helglön: december 32 tim (24, 25, 26, 31 dec), januari 16 tim (1 och 6 jan) —
//     trots Daniels semester 29–30 dec och 2 jan, Maxs föräldraledighet 22–23 dec och 7 jan (+ semester 2 jan), och trots att
//     Oskar ARBETADE trettondagen 6 jan (företagets praxis: röd vardag = alltid 8 tim, arbetade timmar lönas dessutom).
//   - En nyanställd (3 månaders kvalifikationstid, mom 3) fick ingen helglön.
//   - Företagsledarna (Martin, Joacim) får inga lönerader alls: deras lön ligger utanför appen.
// Det här är ingen enhetstest av en funktion utan hela vägen: databas → beraknaLoneunderlag → Fortnox-rader. Löneperiod 2026-01 =
// arbetstid december 2025; löneperiod 2026-02 = arbetstid januari 2026.
import { describe, it, expect } from "vitest";
import { beraknaLoneunderlag } from "./loneunderlag";
import { tabellKlient } from "./testdata/tabellKlient";
import { PROD_MAPPNING } from "./testdata/sepKlient";

const MAPPNING = [
  ...PROD_MAPPNING,
  { intern_typ: "helglon_skordare", extern_kod: "1461", beskrivning: "Helglön, timmar" },
  { intern_typ: "helglon_skotare", extern_kod: "1462", beskrivning: "Helglön, timmar 2" },
];

const PERSONER = [
  { id: "stefan", namn: "Stefan", maskin_id: "PONS20SDJAA270231", foretagsledare: false, anstallningsdatum: "2025-07-31" },
  { id: "oskar", namn: "Oskar", maskin_id: "R64101", foretagsledare: false, anstallningsdatum: "2023-02-24" },
  { id: "daniel", namn: "Daniel", maskin_id: "A110148", foretagsledare: false, anstallningsdatum: "2025-06-02" },
  { id: "max", namn: "Max", maskin_id: "A030353", foretagsledare: false, anstallningsdatum: "2024-06-05" },
  { id: "oscar", namn: "Oscar", maskin_id: "JD810E", foretagsledare: false, anstallningsdatum: "2025-12-01" },
  { id: "martin", namn: "Martin", maskin_id: null, foretagsledare: true, anstallningsdatum: null },
  { id: "joacim", namn: "Joacim", maskin_id: "PONS20SDJAA270231", foretagsledare: true, anstallningsdatum: null },
];

const dag = (id: string, datum: string, maskin_id: string, min = 480) => ({
  id: `d-${id}-${datum}`, medarbetare_id: id, datum, arbetad_min: min, maskin_id, km_totalt: 0, bekraftad: true, dagtyp: "Produktion",
  synk_avvikelse: null, start_tid: "07:00:00", brandrisk_beordrad: null, slut_tid: "16:00:00", rast_min: 30, traktamente: false, objekt_id: null,
});
const led = (id: string, typ: string, start: string, slut: string, status = "godkänd") =>
  ({ id: `l-${id}-${typ}-${start}`, medarbetare_id: id, typ, startdatum: start, slutdatum: slut, ersatter_datum: null, fran_tid: null, till_tid: null, status });

const GRUND_LEDIGHET = () => [
  led("daniel", "semester", "2025-12-29", "2025-12-30"), led("daniel", "semester", "2026-01-02", "2026-01-02"),
  led("max", "foraldraledig", "2025-12-22", "2025-12-23", "registrerad"), led("max", "foraldraledig", "2026-01-07", "2026-01-07", "registrerad"),
  led("max", "semester", "2026-01-02", "2026-01-02"),
];

function databas(over: { mappning?: typeof MAPPNING; personer?: typeof PERSONER; extraLedighet?: ReturnType<typeof led>[] } = {}) {
  return tabellKlient({
    medarbetare: over.personer ?? PERSONER,
    arbetsdag: [
      // Stefan (skördare Ponsse): jobbar före jul och efter nyår, aldrig på en röd dag
      dag("stefan", "2025-12-22", "PONS20SDJAA270231"), dag("stefan", "2025-12-23", "PONS20SDJAA270231"),
      dag("stefan", "2026-01-05", "PONS20SDJAA270231"), dag("stefan", "2026-01-07", "PONS20SDJAA270231"),
      // Oskar (skördare Rottne): arbetar tisdag 6 jan (trettondagen)
      dag("oskar", "2025-12-22", "R64101"), dag("oskar", "2025-12-23", "R64101"), dag("oskar", "2025-12-29", "R64101"), dag("oskar", "2025-12-30", "R64101"),
      dag("oskar", "2026-01-05", "R64101"), dag("oskar", "2026-01-06", "R64101"), dag("oskar", "2026-01-07", "R64101"),
      // Daniel (skotare): semester 29–30 dec och 2 jan
      dag("daniel", "2025-12-22", "A110148"), dag("daniel", "2025-12-23", "A110148"),
      dag("daniel", "2026-01-05", "A110148"), dag("daniel", "2026-01-07", "A110148"),
      // Max (skotare): föräldraledig 22–23 dec och 7 jan, semester 2 jan
      dag("max", "2025-12-29", "A030353"), dag("max", "2025-12-30", "A030353"), dag("max", "2026-01-05", "A030353"),
      // Oscar: anställd 1 dec 2025 → ingen helglön före 1 mars 2026
      dag("oscar", "2025-12-15", "JD810E"), dag("oscar", "2025-12-16", "JD810E"), dag("oscar", "2026-01-12", "JD810E"),
      // Företagsledarna arbetar också — men får inga lönerader
      dag("martin", "2025-12-22", "A030353"), dag("martin", "2026-01-05", "A030353"),
      dag("joacim", "2025-12-26", "PONS20SDJAA270231", 26), dag("joacim", "2025-12-31", "PONS20SDJAA270231", 324),
      dag("joacim", "2026-01-05", "PONS20SDJAA270231", 29),
    ],
    ledighet_ansokningar: over.extraLedighet ?? GRUND_LEDIGHET(),
    dim_maskin: [["PONS20SDJAA270231", "Harvester"], ["R64101", "Harvester"], ["A110148", "Forwarder"], ["A030353", "Forwarder"], ["JD810E", "Forwarder"]]
      .map(([maskin_id, maskin_typ]) => ({ maskin_id, maskin_typ, sander_filer: true })),
    medarbetare_lonesystem: PERSONER.map((p, i) => ({ medarbetare_id: p.id, anstallningsnummer: String(2001 + i) })),
    gs_avtal: [{ giltigt_fran: "2025-04-01", km_grans_per_dag: 60, helglon_dagar: null, ordinarie_vecka_h: 40 }],
    lonesystem_koppling: [{ id: "ls1", system_typ: "fortnox" }],
    lonesystem_artikelmappning: (over.mappning ?? MAPPNING).map((m, i) => ({ id: `x${i + 1}`, lonesystem_id: "ls1", ...m })),
  });
}

async function helglon(period: string, namn: string, over?: Parameters<typeof databas>[0]) {
  const u = await beraknaLoneunderlag(databas(over), { period });
  const r = u.resultat.find(x => x.namn === namn)!;
  const rader = r.rader.filter(x => x.loneart.startsWith("helglon")).map(x => [x.loneart, x.SalaryCode, x.Number]);
  return { r, rader, u };
}

describe("FACIT december 2025 (löneperiod 2026-01): 32 tim, rätt löneart per maskintyp", () => {
  it.each([
    ["Stefan", "helglon_skordare", "1461"],
    ["Oskar", "helglon_skordare", "1461"],
    ["Daniel", "helglon_skotare", "1462"],
    ["Max", "helglon_skotare", "1462"],
  ])("%s: %s (%s), 32,00 tim", async (namn, art, kod) => {
    const { rader, r } = await helglon("2026-01", namn);
    expect(rader).toEqual([[art, kod, "32.00"]]);
    expect(r.helglon.timmar).toBe(32);
    expect(r.helglon.dagar.map(d => [d.datum, d.ger])).toEqual([["2025-12-24", true], ["2025-12-25", true], ["2025-12-26", true], ["2025-12-31", true]]);
  });
});

describe("FACIT januari 2026 (löneperiod 2026-02): 16 tim — också Oskar som arbetade 6 jan", () => {
  it.each([
    ["Stefan", "helglon_skordare", "1461"],
    ["Oskar", "helglon_skordare", "1461"],
    ["Daniel", "helglon_skotare", "1462"],
    ["Max", "helglon_skotare", "1462"],
  ])("%s: %s (%s), 16,00 tim", async (namn, art, kod) => {
    const { rader } = await helglon("2026-02", namn);
    expect(rader).toEqual([[art, kod, "16.00"]]);
  });

  it("Oskars arbetade trettondag märks (arbetad) men ger helglön, och timmarna han arbetade lönas som vanligt", async () => {
    const { r } = await helglon("2026-02", "Oskar");
    expect(r.helglon.dagar.find(d => d.datum === "2026-01-06")).toMatchObject({ arbetad: true, ger: true, skal: "betalas_arbetad" });
    // 3 arbetsdagar (5, 6, 7 jan) × 8 h = 24 h timlön — den arbetade röda dagen är en vanlig arbetsdag
    expect(r.rader.find(x => x.loneart === "timlon")!.Number).toBe("24.00");
  });
});

describe("kvalifikationstid: nyanställd (anställd 1 dec 2025) får ingen helglön", () => {
  it("december och januari: ingen helglönerad, och dagarna säger varför", async () => {
    for (const period of ["2026-01", "2026-02"]) {
      const { r, rader } = await helglon(period, "Oscar");
      expect(rader).toEqual([]);
      expect(r.helglon.timmar).toBe(0);
      expect(r.helglon.dagar.every(d => !d.ger && d.skal === "kvalifikationstid")).toBe(true);
    }
  });
  it("saknat anställningsdatum: helglön betalas, med en varning om att kvalifikationstiden inte är kontrollerad", async () => {
    const utanDatum = PERSONER.map(p => (p.id === "oscar" ? { ...p, anstallningsdatum: null } : p));
    const { r, rader } = await helglon("2026-01", "Oscar", { personer: utanDatum });
    expect(rader).toEqual([["helglon_skotare", "1462", "32.00"]]);
    expect(r.helglon.anstallningsdatumSaknas).toBe(true);
    expect(r.varningar.some(v => /Anställningsdatum saknas/.test(v))).toBe(true);
  });
  it("med anställningsdatum finns ingen sådan varning", async () => {
    const { r } = await helglon("2026-01", "Stefan");
    expect(r.helglon.anstallningsdatumSaknas).toBe(false);
    expect(r.varningar.some(v => /Anställningsdatum saknas/.test(v))).toBe(false);
  });
});

describe("FÖRETAGSLEDARE (medarbetare.foretagsledare = true): inga lönerader alls", () => {
  it.each([["Martin"], ["Joacim"]])("%s: 0 rader, 0 lönerader, ingen saknad kod, i båda månaderna", async (namn) => {
    for (const period of ["2026-01", "2026-02"]) {
      const { r } = await helglon(period, namn);
      expect(r.foretagsledare).toBe(true);
      expect(r.rader).toEqual([]);
      expect(r.lonerader).toEqual([]);
      expect(r.saknade_loneartskoder).toEqual([]);
      expect(r.helglon.timmar).toBe(0);
    }
  });
  it("räknas inte i totalt antal rader, och blockerar inte en sändning även utan helglönekod", async () => {
    const utanKod = MAPPNING.filter(m => !m.intern_typ.startsWith("helglon"));
    const u = await beraknaLoneunderlag(databas({ mappning: utanKod }), { period: "2026-01" });
    const ledare = u.resultat.filter(r => r.foretagsledare);
    expect(ledare.map(r => r.namn).sort()).toEqual(["Joacim", "Martin"]);
    expect(u.totalt_rader).toBe(u.resultat.filter(r => !r.foretagsledare).reduce((s, r) => s + r.rader.length, 0));
    const { blockerandeLonearter } = await import("./loneartSaknas");
    // de fyra förarna saknar helglönekoden (2 skördare + 2 skotare + Oscar utan helglön) — företagsledarna bidrar inte
    const namnen = blockerandeLonearter(u.resultat).flatMap(b => b.forare.map(f => f.namn));
    expect(namnen).not.toContain("Martin");
    expect(namnen).not.toContain("Joacim");
  });
  it("förarna som INTE är företagsledare påverkas inte av att andra är det", async () => {
    const { r } = await helglon("2026-01", "Stefan");
    expect(r.foretagsledare).toBe(false);
    expect(r.rader.length).toBeGreaterThan(0);
  });
});

describe("närvarokravet över månadsskiftet, hela vägen ur databasen", () => {
  it("tjänstledig 30 dec (ledighet i december) bryter nyårsdagen i januari — men inte trettondagen", async () => {
    const tjanstledig = [
      ...GRUND_LEDIGHET(),
      led("stefan", "tjanstledig", "2025-12-30", "2025-12-30"),
    ];
    const u = await beraknaLoneunderlag(databas({ extraLedighet: tjanstledig }), { period: "2026-02" });
    const r = u.resultat.find(x => x.namn === "Stefan")!;
    expect(r.helglon.dagar.map(d => [d.datum, d.ger, d.skal])).toEqual([["2026-01-01", false, "tjanstledig_omger"], ["2026-01-06", true, "betalas"]]);
    expect(r.rader.filter(x => x.loneart.startsWith("helglon")).map(x => x.Number)).toEqual(["8.00"]);
  });
  it("sjuk 1 jan (helgdagen själv) bryter bara den dagen — Max som är föräldraledig 7 jan förlorar inget", async () => {
    const u = await beraknaLoneunderlag(databas({ extraLedighet: [...GRUND_LEDIGHET(), led("stefan", "sjuk", "2026-01-01", "2026-01-01", "registrerad")] }), { period: "2026-02" });
    expect(u.resultat.find(x => x.namn === "Stefan")!.rader.find(x => x.loneart.startsWith("helglon"))!.Number).toBe("8.00");
    expect(u.resultat.find(x => x.namn === "Max")!.rader.find(x => x.loneart.startsWith("helglon"))!.Number).toBe("16.00");
  });
});

describe("tom kod per maskintyp: bara den löneart som saknar kod blockerar", () => {
  it("helglon_skotare utan kod: Daniel och Max röda, Stefan och Oskar går igenom", async () => {
    const utanSkotare = MAPPNING.filter(m => m.intern_typ !== "helglon_skotare");
    const u = await beraknaLoneunderlag(databas({ mappning: utanSkotare }), { period: "2026-01" });
    const { blockerandeLonearter } = await import("./loneartSaknas");
    const b = blockerandeLonearter(u.resultat);
    expect(b.map(x => x.loneart)).toEqual(["helglon_skotare"]);
    expect(b[0].forare.map(f => f.namn).sort()).toEqual(["Daniel", "Max"]);
    expect(b[0].forare[0].mangd).toBe("32.00");
    const stefan = u.resultat.find(r => r.namn === "Stefan")!;
    expect(stefan.rader.some(r => r.loneart === "helglon_skordare" && r.SalaryCode === "1461")).toBe(true);
  });
});
