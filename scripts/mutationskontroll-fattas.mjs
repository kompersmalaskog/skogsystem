// Mutationskontroll för "Vad behöver du kolla?" på en trakt (2026-11-16):
// lassens täckning, kronorna per post, vad som frågas och vad som inte gör det.
// Ändrar EN sak i taget och kräver att testerna blir RÖDA.
//
//   node scripts/mutationskontroll-fattas.mjs
//
// EN tung körning åt gången — kör den inte tillsammans med tsc, build eller
// en annan vitest. Avbryts den mitt i kan en mutant ligga kvar i källan:
// kontrollera med git diff innan du committar.
import { kor } from "./mutationsmotor.mjs";

const F = "lib/faktura/fattas.ts";
const R = "app/api/faktura/underlag/route.ts";

const TESTER = [
  "lib/faktura/fattas.test.ts",
  "app/api/faktura/underlag/route.test.ts",
  "components/faktura/TraktKlient.render.test.tsx",
];

const M = [
  // ── lassens täckning: det som gör Skälviken till 0,97 i stället för 40 kr ──
  ["täckningen: kravet 80 % → 1 % (Skälvikens 2 % passerar och varnar aldrig)",
    "export const TACKNING_KRAV = 0.8;", "export const TACKNING_KRAV = 0.01;", F],
  ["täckningen: kravet 80 % → 100 % (Rävemålas 102 % är det enda som duger)",
    "export const TACKNING_KRAV = 0.8;", "export const TACKNING_KRAV = 1.0;", F],
  ["täckningen mäts på ANTAL lass i stället för volym",
    "const tackning = d.volymM3fub > 0 ? d.avstand.lassVolym / d.volymM3fub : 0;",
    "const tackning = d.volymM3fub > 0 ? d.avstand.lassAntal / d.volymM3fub : 0;", F],
  ["täckningen jämförs åt fel håll (full täckning varnar, tunn tiger)",
    "if (tackning >= TACKNING_KRAV) return null;",
    "if (tackning < TACKNING_KRAV) return null;", F],
  ["en satt siffra är INTE ett svar — posten kommer ändå (Brokamåla får en rad)",
    "  if (d.avstand.manuellt != null) return null;", "", F],
  ["inga lass får samma text som tunn täckning (\"bygger på 0 %\" i stället för \"är inte satt\")",
    "  if (d.avstand.lassAntal === 0) {", "  if (false) {", F],

  // ── kronorna: talet som gör att raden landar ──
  ["avståndets kr/m³ delas inte på volymen (1 680 i stället för 0,97)",
    "const krPerM3 = d.volymM3fub > 0 ? d.avstand.kronor / d.volymM3fub : 0;",
    "const krPerM3 = d.avstand.kronor;", F],
  ["sortimentets kronor räknas inte mot hela trakten (2 i stället för 3 450)",
    "  const kronor = krPerM3 * d.volymM3fub;", "  const kronor = krPerM3;", F],
  ["sortimentets extra räknas utan satsen (1 i stället för +2,00 kr/m³)",
    "  const krPerM3 = extra * krPerExtra;", "  const krPerM3 = extra;", F],
  ["extra jämförs mot noll åt fel håll (5 sortiment får ett tillägg)",
    "    varde: extra > 0", "    varde: extra >= 0", F],

  // ── vad som frågas, och vad som inte gör det ──
  ["terrängen frågas även när den är satt (Brokamålas 2 kr får en rad)",
    "  if (d.terrangKr !== 0) return null;", "", F],
  ["sortimentet frågas även när antalet är satt för hand",
    "  if (d.sortiment.manuellt) return null;", "", F],
  ["timpeng får avstånd och terräng (frågor som inte hör till avtalsformen)",
    "  const ackord = !d.timpeng;", "  const ackord = true;", F],
  ["ingen sats i prislistan hittar på ett värde i stället för null",
    "      varde: null,\n      var: 'granskning',", "      varde: '0 kr',\n      var: 'granskning',", F],
  ["kontraktsnummer frågas aldrig (Anders Ingemarsson syns inte)",
    "  if (!d.kontraktsnummer) {", "  if (false) {", F],

  // ── ordningen och rubriken ──
  ["ordningen kastas om: sortimentet före avstånd och terräng",
    "  if (ackord) {\n    const a = avstandPost(d);", "  if (false) {\n    const a = avstandPost(d);", F],
  ["rubriken säger \"1 saker\"",
    "return poster.length === 1 ? '1 sak att kolla' : `${poster.length} saker att kolla`;",
    "return `${poster.length} saker att kolla`;", F],

  // ── rutten: kortet räknas på serverns underlag, inte på gissningar ──
  ["ett oläsbart VO får poster i stället för en tom lista",
    "          fattas: [],", "          fattas: byggFattas({ timpeng: false, kontraktsnummer: null, volymM3fub: 0, terrangKr: 0, avstand: { manuellt: null, lassVolym: 0, lassAntal: 0, kronor: 0 }, sortiment: { manuellt: false, anvant: 0, raknat: 0, grundantal: 6, krPerExtra: 2 } }),", R],
];

kor({ filer: [F, R], tester: TESTER, standardFil: F, mutationer: M });
