// Mutationskontroll för timpriset på vårt eget manuella arbete: varje regel som
// håller kronor-per-timme ärlig ska bli RÖD när EN sak ändras tillbaka.
// Motorn: scripts/mutationsmotor.mjs.
//
// Täcker: EN rad per aktivitetstyp (inte per post), minuter summeras före
// avrundningen, en typ UTAN sats får aldrig ett gissat pris, ett läsfel är ett
// fel (aldrig tomt), alt-numren läses, och arbete_timpris står utanför kastet
// så underlaget fungerar innan migrationen är körd.
//
// Kör:  node scripts/mutationskontroll-arbetspris.mjs   (EN tung körning åt gången)
import { kor } from "./mutationsmotor.mjs";

const PRIS = "lib/faktura/arbetspris.ts";
const LAS = "lib/faktura/lasManuellt.ts";
const HAMTA = "lib/faktura/hamtaUnderlag.ts";

const TESTER = [
  "lib/faktura/arbetspris.test.ts",
  "lib/faktura/arbetspris.vakter.test.ts",
];

const M = [
  // ── EN rad per typ, minuterna summeras ──
  ["grupperar på etiketten i stället för typen", "const nyckel = p.typ ?? '';", "const nyckel = p.etikett;", PRIS],
  ["sista posten vinner i stället för att summeras", "finns.minuter += p.minuter;", "finns.minuter = p.minuter;", PRIS],
  ["typens namn förlorar mot fritexten", "etikett: TYPNAMN[nyckel] ?? p.etikett ?? 'Arbete',", "etikett: p.etikett ?? TYPNAMN[nyckel] ?? 'Arbete',", PRIS],
  ["noll-minutersrader följer med", ".filter(r => r.minuter > 0)", ".filter(() => true)", PRIS],

  // ── avrundningen ──
  ["timmarna avrundas nedåt", "Math.round((minuter / 60) * 100) / 100", "Math.floor((minuter / 60) * 100) / 100", PRIS],
  ["timmarna avrundas inte alls", "Math.round((minuter / 60) * 100) / 100", "minuter / 60", PRIS],

  // ── en typ utan sats får ALDRIG ett gissat pris ──
  ["en typ utan sats får 490 ändå", "timpris: prisKarta.get(r.typ ?? '') ?? null,", "timpris: prisKarta.get(r.typ ?? '') ?? 490,", PRIS],
  ["priset slås upp på etiketten", "timpris: prisKarta.get(r.typ ?? '') ?? null,", "timpris: prisKarta.get(r.etikett) ?? null,", PRIS],

  // ── noten säger vilket det är ──
  ["noten påstår att allt är prissatt", "if (utan.length === 0) {", "if (utan.length >= 0) {", PRIS],
  ["noten säger en sats när det finns flera", "satser.length === 1", "satser.length >= 1", PRIS],

  // ── läsningen: tomt och trasigt är inte samma sak ──
  ["ett läsfel blir en tom lista", "if (error) return { status: 'fel', fel: error.message };", "if (error) return { status: 'ok', poster: [] };", LAS],
  ["allt arbete faktureras, inte bara det debiterbara", ".eq('debiterbar', true)", ".eq('debiterbar', false)", LAS],
  ["bara traktens eget nummer läses (alt-numren tappas)", ".in('objekt_id', nummer)", ".eq('objekt_id', vo)", LAS],
  ["extranumren hämtas aldrig", "for (const r of alt ?? []) if (r.nummer) nummer.add(String(r.nummer));", "", LAS],

  // ── mappningen ManuellPost → Arbetspost ──
  ["posterna skickas rakt in (etiketten blir undefined)", "byggArbetsrader(tillArbetsposter(arbSvar.poster), giltiga(arbPrisRes.data))", "byggArbetsrader(arbSvar.poster as any, giltiga(arbPrisRes.data))", HAMTA],
  ["mappningen tappar etiketten", "return poster.map(p => ({ typ: p.typ, etikett: p.aktivitet, minuter: p.minuter }));", "return poster.map(p => ({ typ: p.typ, etikett: '', minuter: p.minuter }));", LAS],

  // ── arbete_timpris utanför kastet ──
  ["arbete_timpris fäller underlaget innan migrationen är körd", "ovrigtRes, avstRes, klassRes, bolagRes, objektRes]) {", "ovrigtRes, avstRes, klassRes, bolagRes, objektRes, arbPrisRes]) {", HAMTA],
  ["ett läsfel på timpriset sägs inte", "if (arbPrisRes.error) {", "if (false && arbPrisRes.error) {", HAMTA],
  ["timmar utan sats sägs inte i granskningen", "for (const r of arbetsrader.filter(r => r.timpris == null)) {", "for (const r of []) {", HAMTA],
  ["läsfelet på arbetet tystas", "if (arbSvar.status === 'fel') {", "if (false) {", HAMTA],
];

kor({ filer: [PRIS, LAS, HAMTA], tester: TESTER, standardFil: PRIS, mutationer: M });
