// Mutationskontroll för helglönen och företagsledarna (lön/export, testnivå full): varje del av regeln — arbetad röd dag, närvarokravet
// (på dagen / omger dagen), kvalifikationstiden, maskintypen, företagsledarna ut — ska bli RÖD när EN sak ändras tillbaka. Motorn:
// scripts/mutationsmotor.mjs. Regeln: lib/lonesystem/helglon.ts (docs/lonesystem/lonearter.md, "Helglön").
//
// Kör:  node scripts/mutationskontroll-helglon.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
//       Dela upp med MUT_FRAN=0 MUT_TILL=20 om tidsgränsen är kort. Avbryts den mitt i kan en mutant ligga kvar i källan:
//       kontrollera att varje mönster finns exakt en gång (motorn gör det) innan du committar.
import { kor } from "./mutationsmotor.mjs";

const HEL = "lib/lonesystem/helglon.ts";
const BER = "lib/lonesystem/loneberakning.ts";
const UND = "lib/lonesystem/loneunderlag.ts";
const RUT = "app/api/fortnox/salary-export/route.ts";
const FOR = "lib/lonesystem/forarText.ts";

const TESTER = [
  "lib/lonesystem/helglon.narvaro.test.ts",
  "lib/lonesystem/helglon.facit.test.ts",
  "lib/lonesystem/loneberakning.helglon.test.ts",
  "lib/lonesystem/forarText.test.ts",
  "lib/lonesystem/septemberbytediff.test.ts",
  "app/api/fortnox/salary-export/route.test.ts",
];

const BRYTER = 'const BRYTER_PA_DAGEN = ["sjuk", "vab", "foraldraledig", "tjanstledig"];';
const GRANNAR = "[narmasteVardag(dag.datum, -1), narmasteVardag(dag.datum, +1)]";

const M = [
  // ── grundregeln: arbetad röd dag ger helglön ──
  ["arbetad röd dag ger ingen helglön (gamla regeln)", 'return { ger: true, skal: arbetad ? "betalas_arbetad" : "betalas" };', 'return { ger: !arbetad, skal: arbetad ? "betalas_arbetad" : "betalas" };', HEL],
  ["arbetad röd dag märks inte som arbetad", '"betalas_arbetad" : "betalas" };', '"betalas" : "betalas" };', HEL],
  ["fel antal timmar per röd dag", "export const HELGLON_TIMMAR = 8;", "export const HELGLON_TIMMAR = 7;", HEL],
  ["helger ger helglön", ".filter(([datum]) => arVardag(datum))", ".filter(() => true)", HEL],
  ["bara dagar som ger helglön räknas inte (alla röda dagar räknas)", "helglonGerDagar.length * HELGLON_TIMMAR", "helglonDagarLista.length * HELGLON_TIMMAR", BER],

  // ── närvarokravet: PÅ själva dagen ──
  ["sjuk på dagen bryter inte", BRYTER, 'const BRYTER_PA_DAGEN = ["vab", "foraldraledig", "tjanstledig"];', HEL],
  ["VAB på dagen bryter inte", BRYTER, 'const BRYTER_PA_DAGEN = ["sjuk", "foraldraledig", "tjanstledig"];', HEL],
  ["föräldraledig på dagen bryter inte", BRYTER, 'const BRYTER_PA_DAGEN = ["sjuk", "vab", "tjanstledig"];', HEL],
  ["tjänstledig på dagen bryter inte", BRYTER, 'const BRYTER_PA_DAGEN = ["sjuk", "vab", "foraldraledig"];', HEL],
  ["semester på dagen bryter", BRYTER, 'const BRYTER_PA_DAGEN = ["sjuk", "vab", "foraldraledig", "tjanstledig", "semester"];', HEL],
  ["en deldag bryter inte", "(arDeldag(p) || !arbetad)", "!arbetad", HEL],
  ["en heldagsrad vinner inte över arbete", "(arDeldag(p) || !arbetad)", "true", HEL],

  // ── närvarokravet: tjänstledighet som OMGER dagen ──
  ["tjänstledig dagen före/efter bryter aldrig", "for (const grann of " + GRANNAR + ") {", "for (const grann of [] as string[]) {", HEL],
  ["bara dagen FÖRE kontrolleras", GRANNAR, "[narmasteVardag(dag.datum, -1)]", HEL],
  ["bara dagen EFTER kontrolleras", GRANNAR, "[narmasteVardag(dag.datum, +1)]", HEL],
  ["närmaste vardag hoppar inte över helger", "while (!arVardag(d) || arRod(d)) d = plusDagar(d, riktning);", "while (arRod(d)) d = plusDagar(d, riktning);", HEL],
  ["närmaste vardag hoppar inte över röda dagar", "while (!arVardag(d) || arRod(d)) d = plusDagar(d, riktning);", "while (!arVardag(d)) d = plusDagar(d, riktning);", HEL],
  ["arbete på grannvardagen vinner inte över tjänstledigheten", "if (u.arbetadeDatum.has(grann)) continue;", "", HEL],
  ["vilken frånvaro som helst dagen före bryter", 'p.typ === "tjanstledig" && !arDeldag(p) && tacker(p, grann)', 'p.typ !== "inarbetad" && !arDeldag(p) && tacker(p, grann)', HEL],
  ["en deldag tjänstledig dagen före bryter", 'p.typ === "tjanstledig" && !arDeldag(p) && tacker(p, grann)', 'p.typ === "tjanstledig" && tacker(p, grann)', HEL],

  // ── kvalifikationstiden ──
  ["kvalifikationstiden ignoreras", "if (u.anstallningsdatum && dag.datum < laggTillManader(u.anstallningsdatum, 3))", "if (false && u.anstallningsdatum && dag.datum < laggTillManader(u.anstallningsdatum, 3))", HEL],
  ["kvalifikationstiden är två månader", "laggTillManader(u.anstallningsdatum, 3)", "laggTillManader(u.anstallningsdatum, 2)", HEL],
  ["kvalifikationsgränsen är en dag fel (första dagen efter tre månader ger inte)", "dag.datum < laggTillManader", "dag.datum <= laggTillManader", HEL],
  ["saknat anställningsdatum stänger av helglönen", "if (u.anstallningsdatum && dag.datum <", "if (!u.anstallningsdatum || dag.datum <", HEL],
  ["månadsslut klipps inte (30 nov + 3 mån)", "d.setDate(Math.min(dag, sista));", "d.setDate(dag);", HEL],
  ["anställningsdatum läses inte", "anstallningsdatum: med.anstallningsdatum ?? null,", "anstallningsdatum: null,", UND],
  ["saknat datum varnar inte", "const anstallningsdatumSaknas = helglonDagarLista.length > 0 && !anstDatum;", "const anstallningsdatumSaknas = false;", BER],
  ["anställningsdatum ignoreras i beräkningen", 'const anstDatum = (lon.anstallningsdatum || "").trim() || null;', "const anstDatum = null;", BER],

  // ── frånvaron runt månaden ──
  ["frånvaron runt månaden används inte (bara månadens egen)", "const franvaroRunt: FranvaroPost[] = (lon.franvaroRunt ?? ledigheter)", "const franvaroRunt: FranvaroPost[] = (ledigheter)", BER],
  ["frånvaron runt månaden läses inte", "franvaroRunt: ledRuntPerMed.get(med.id) || [],", "franvaroRunt: undefined,", UND],
  ["frånvarofönstret är för snävt", "const FRANVARO_MARGINAL_DAGAR = 10;", "const FRANVARO_MARGINAL_DAGAR = 1;", UND],
  ["frånvarotypen läses med versaler", 'typ: String(l.typ || "").toLowerCase()', 'typ: String(l.typ || "")', BER],

  // ── maskintyp ──
  ["helglön är alltid skördare", '(skordareH >= skotareH ? "helglon_skordare" : "helglon_skotare")', '"helglon_skordare"', BER],
  ["helglönens maskintyp är omvänd", '(skordareH >= skotareH ? "helglon_skordare" : "helglon_skotare")', '(skordareH >= skotareH ? "helglon_skotare" : "helglon_skordare")', BER],
  ["medarbetarradens maskin ignoreras", ': radMaskinTyp === "skordare" ? "helglon_skordare" : radMaskinTyp === "skotare" ? "helglon_skotare" : null;', ": null;", BER],
  ["okänd maskintyp gissas som skördare", 'radMaskinTyp === "skotare" ? "helglon_skotare" : null;', 'radMaskinTyp === "skotare" ? "helglon_skotare" : "helglon_skordare";', BER],

  // ── företagsledare ──
  ["företagsledare får lönerader", "if (foretagsledare) return; // lönen ligger utanför appen", "if (false) return; // lönen ligger utanför appen", BER],
  ["företagsledare får helglön i översikten", "const helglonDagarLista: HelglonDag[] = foretagsledare ? [] :", "const helglonDagarLista: HelglonDag[] = false ? [] :", BER],
  ["företagsledare får premievarning", "if (premieBas > 0 && !foretagsledare) {", "if (premieBas > 0) {", BER],
  ["företagsledare får anställningsnummer-varning", "if (!anstallningsnummer && !foretagsledare) {", "if (!anstallningsnummer) {", BER],
  ["företagsledare visar timlön", "timlon_h: foretagsledare ? 0 : timlonH,", "timlon_h: timlonH,", BER],
  ["företagsledare visar övertid", "overtid_h: foretagsledare ? 0 : overtidH,", "overtid_h: overtidH,", BER],
  ["företagsledare visar vältlappar", "valtlappar_veckor: foretagsledare ? 0 : vältVeckor,", "valtlappar_veckor: vältVeckor,", BER],
  ["företagsledare visar mil", "kor_mil: foretagsledare ? 0 : totalMil,", "kor_mil: totalMil,", BER],
  ["flaggan läses inte ur medarbetare", "foretagsledare: med.foretagsledare === true,", "foretagsledare: false,", UND],
  ["företagsledare skickas", "if (r.foretagsledare) continue;", "", RUT],
  ["företagsledare räknas bland de skickade", "resultat.filter(r => !r.foretagsledare).map(r => ({", "resultat.map(r => ({", RUT],

  // ── förarens ord i Min månad ──
  ["orsaken till uteblivd helglön visas inte", "if (h.ger === false) {", "if (false) {", FOR],
  ["arbetad röd dag får ingen egen text", "return h.arbetad\n    ? `Du arbetade", "return false\n    ? `Du arbetade", FOR],
  ["helglön 'går till lönen' alltid", 'const slut = gar ? "Går till lönen." : EJ_BESTAMD;', 'const slut = "Går till lönen.";', FOR],
  ["maskintypsvarningen visas ordagrant", "/^Ingen helglön skickas/, ", "", FOR],
  ["anställningsdatum-varningen visas för föraren", "/^Anställningsdatum saknas/,", "", FOR],
  ["ingen post när maskintypen saknas", "if (varn.some(v => /^Ingen helglön skickas/.test(v))) {", "if (false) {", FOR],
];

kor({
  filer: [HEL, BER, UND, RUT, FOR],
  tester: TESTER,
  standardFil: HEL,
  mutationer: M.slice(Number(process.env.MUT_FRAN ?? 0), Number(process.env.MUT_TILL ?? M.length)),
});
