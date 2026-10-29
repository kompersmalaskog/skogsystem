// Mutationskontroll för förslaget vägsymboler → vägfärg (2026-10-28). Varje regel ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
// Lätt (inga Chromium-tester): ren logik, komponenten och källvakterna.
//
// Kör:  node scripts/mutationskontroll-vagfarg.mjs
import { kor } from "./mutationsmotor.mjs";

const LIB = "lib/vagSymbolFarg.ts";
const KOMP = "components/planering/VagFargForslag.tsx";
const SIDA = "app/planering/page.tsx";

const TESTER = [
  "lib/vagSymbolFarg.test.ts",
  "lib/vagSymbolFarg.vakter.test.ts",
  "components/planering/VagFargForslag.render.test.tsx",
];

const M = [
  // ── färgen ur texten ──
  ["två olika färger räknas som den första", "return hittade.size === 1 ? [...hittade][0] : null;", "return hittade.size >= 1 ? [...hittade][0] : null;", LIB],
  ["ordet behöver inte stå ensamt (Rödingvägen = röd)", "if (/(^|[^a-zåäö])(röd|rött|röda)(?![a-zåäö])/.test(t)) hittade.add('red');", "if (/(röd|rött|röda)/.test(t)) hittade.add('red');", LIB],
  // ── vilken väg ──
  ["gränsen ignoreras (symbol hur långt bort som helst)", "if (d <= maxM && (!bast || d < bast.d)) bast = { m: v.m, d };", "if (!bast || d < bast.d) bast = { m: v.m, d };", LIB],
  ["FÖRSTA vägen inom gränsen, inte närmaste", "if (d <= maxM && (!bast || d < bast.d)) bast = { m: v.m, d };", "if (d <= maxM && !bast) bast = { m: v.m, d };", LIB],
  ["gränsen 100 m i stället för 25", "export const VAGSYMBOL_MAX_M = 25;", "export const VAGSYMBOL_MAX_M = 100;", LIB],
  ["stickvägar räknas som basvägar", "m.isLine === true && m.lineType === 'mainRoad' &&", "m.isLine === true && (m.lineType === 'mainRoad' || String(m.lineType).startsWith('sideRoad')) &&", LIB],
  ["alla symboltyper räknas som vägsymboler", "m.isMarker === true && m.type === VAGSYMBOL_TYP", "m.isMarker === true", LIB],
  // ── vad som inte rörs ──
  ["krock: vägen får den första färgen", "if (rad.fargerna.size > 1) { orort.krock++; continue; }", "", LIB],
  ["vägen med annan färg skrivs över", "if (nu != null && nu !== farg) { orort.annanFarg++; continue; }", "", LIB],
  ["samma färg räknas som en ändring", "andras: nu !== farg,", "andras: true,", LIB],
  ["symbolerna tas inte bort", "symbolIdn: ut.flatMap((r) => r.symbolIdn), orort", "symbolIdn: [], orort", LIB],
  // ── text ──
  ["raden om det som inte rörs saknas", "return { fraga, orort: delar.length ? `Rörs inte: ${delar.join(', ')}.` : null };", "return { fraga, orort: null };", LIB],
  ["krocken nämns inte", "if (f.orort.krock) delar.push(`${st(f.orort.krock, 'väg', 'vägar')} med två färger`);", "", LIB],
  // ── godkänn ──
  ["Godkänn ändrar också vägar som redan har färgen", "f.vagar.filter((r) => r.andras).map", "f.vagar.map", LIB],
  ["Godkänn tar bort symbolerna från alla vägsymboler", "return { andrade, bortIdn: [...f.symbolIdn] };", "return { andrade, bortIdn: markers.filter((m) => m.type === 'road').map((m) => String(m.id)) };", LIB],
  // ── komponenten ──
  ["Inte nu och Godkänn byter plats", "{ etikett: 'Inte nu', onClick: onInteNu,", "{ etikett: 'Inte nu', onClick: onGodkann,", KOMP],
  ["raden om det som inte rörs visas inte", "{t.orort && <div", "{false && <div", KOMP],
  // ── sidan ──
  ["förslaget räknas också i körvyn", "() => (objektListaVal && valtObjekt && !vagForslagNej", "() => (valtObjekt && !vagForslagNej", SIDA],
  ["förslaget står mitt i ett ritläge", "harVagForslag(vagForslag) && !kartLageIgang && !menuOpen", "harVagForslag(vagForslag) && !menuOpen", SIDA],
  ["Inte nu gäller för alltid", "  useEffect(() => { setVagForslagNej(false); }, [valtObjekt?.id]);", "", SIDA],
  ["symbolerna tas aldrig bort i databasen", "bortMarkorer.forEach((m) => deleteMarkerFromDb(m.id));   // först nu", "// först nu", SIDA],
  ["spöket: symbolerna ritas i full styrka", "if (vagSpokeSymboler.has(String(m.id))) opacity = VAGSYMBOL_SPOKE_OPACITET;", "", SIDA],
];

kor({
  filer: [LIB, KOMP, SIDA],
  tester: TESTER,
  standardFil: LIB,
  mutationer: M,
});
