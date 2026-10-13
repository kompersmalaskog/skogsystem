// Mutationskontroll för lib/arbetstidsgranser.ts (lag och lön: testnivå full).
//
// Ändrar EN sak i taget i gränslogiken — en tröskel, en jämförelse, en sorts frånvaro, ett datumavdrag — kör
// lib/arbetstidsgranser.test.ts och kräver att testerna blir RÖDA. En mutant som överlever betyder att en gräns kan flyttas
// utan att något test märker det. Originalfilen återställs alltid (även vid avbrott); scriptet avslutar med 1 om någon överlevde.
//
// Kör:  node scripts/mutationskontroll-arbetstid.mjs         (EN tung körning åt gången: kör inte tillsammans med tsc/build)
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const FIL = "lib/arbetstidsgranser.ts";
const TEST = "lib/arbetstidsgranser.test.ts";
const original = readFileSync(FIL, "utf8");

/** [namn, från, till] — `från` måste finnas EXAKT en gång (annars är mutationen tvetydig och scriptet stannar). */
const M = [
  // nivå
  ["röd först OVER gränsen (> → >=)", 'if (varde > grans) return "rod";', 'if (varde >= grans) return "rod";'],
  ["gul från 90 % (>= → >)", "Math.round(varde * 1e6) >= Math.round(", "Math.round(varde * 1e6) > Math.round("],
  ["gul-andel 0,9 → 0,8", "gulAndel: 0.9,", "gulAndel: 0.8,"],
  ["gul-andel 0,9 → 0,95", "gulAndel: 0.9,", "gulAndel: 0.95,"],
  // gränserna
  ["allmän övertid 250 → 251", "allmanOvertidAr: 250,", "allmanOvertidAr: 251,"],
  ["extra övertid 150 → 151", "extraOvertidAr: 150,", "extraOvertidAr: 151,"],
  ["extra övertid 150 → 149", "extraOvertidAr: 150,", "extraOvertidAr: 149,"],
  ["övertid per månad 50 → 51", "overtidManad: 50,", "overtidManad: 51,"],
  ["övertid per månad 50 → 49", "overtidManad: 50,", "overtidManad: 49,"],
  ["snitt 48 → 49", "snittVeckaH: 48,", "snittVeckaH: 49,"],
  ["snitt 48 → 47", "snittVeckaH: 48,", "snittVeckaH: 47,"],
  ["snittperiod 4 → 3 månader", "snittManader: 4,", "snittManader: 3,"],
  ["snittperiod 4 → 5 månader", "snittManader: 4,", "snittManader: 5,"],
  ["veckovila 36 → 35", "veckovilaH: 36,", "veckovilaH: 35,"],
  ["dygnsvila 11 → 10", "dygnsvilaH: 11,", "dygnsvilaH: 10,"],
  ["vilafönster 28 → 29 dagar", "vilaFonsterDagar: 28,", "vilaFonsterDagar: 29,"],
  ["vilafönster 28 → 27 dagar", "vilaFonsterDagar: 28,", "vilaFonsterDagar: 27,"],
  ["minsta snittunderlag 28 → 27 dagar", "snittMinDagar: 28,", "snittMinDagar: 27,"],
  ["minsta snittunderlag 28 → 29 dagar", "snittMinDagar: 28,", "snittMinDagar: 29,"],
  ["frånvarodag 8 → 7 tim", "vardagH: 8,", "vardagH: 7,"],
  // övertid per månad
  ["månad: fast > G → >=", "if (fast > G) return \"rod\";", "if (fast >= G) return \"rod\";"],
  ["månad: uppskattad kan bli röd", 'return n === "rod" ? "gul" : n;', "return n;"],
  ["månad: uppskattad räknas inte med", "nivaMotTak(fast + uppskattadH, G)", "nivaMotTak(fast, G)"],
  ["markerad period behandlas som fastställd", "if (p.markerad) {", "if (!p.markerad) {"],
  ["avslutad period läggs på tomDatum", "p.avslutad ? veckaSondag(p.till) : a.tomDatum", "a.tomDatum"],
  ["pågående period läggs på sista veckan", "p.avslutad ? veckaSondag(p.till) : a.tomDatum", "veckaSondag(p.till)"],
  ["veckans månad: måndag i stället för torsdag", "iso(isoVeckaMandag(a.ar, v)), 3)", "iso(isoVeckaMandag(a.ar, v)), 0)"],
  ["veckans månad: söndag i stället för torsdag", "iso(isoVeckaMandag(a.ar, v)), 3)", "iso(isoVeckaMandag(a.ar, v)), 6)"],
  ["fördelning utan skalning", "(p.overtid * s) / summa", "s"],
  ["fördelning: negativa veckor räknas", "Math.max(0, v.timmar - v.bas)", "v.timmar - v.bas"],
  ["månadsval: bara innevarande månad", "if (NIVA_RANG[b.niva] > NIVA_RANG[a.niva]) return b;", "if (false) return b;"],
  ["månadsval: lägst nivå vinner", "if (NIVA_RANG[b.niva] > NIVA_RANG[a.niva]) return b;", "if (NIVA_RANG[b.niva] < NIVA_RANG[a.niva]) return b;"],
  ["månadsval: lägst summa vinner vid lika", "b.total > a.total", "b.total < a.total"],
  ["föregående månad = innevarande", "new Date(y, m - 2, 1)", "new Date(y, m - 1, 1)"],
  ["föregående månad = två månader bakåt", "new Date(y, m - 2, 1)", "new Date(y, m - 3, 1)"],
  // 48-timmarssnittet
  ["snitt: startdagen inräknad", "plusDagar(minusManader(i.tomDatum, GRANSER.snittManader), 1);\n  const minPerDatum", "plusDagar(minusManader(i.tomDatum, GRANSER.snittManader), 0);\n  const minPerDatum"],
  ["snitt: dagar utan +1", ") + 1;\n\n  let arbetadMin", ");\n\n  let arbetadMin"],
  ["snitt: delar med dagar/7 + 1", "timmar / (dagar / 7)", "timmar / (dagar / 7 + 1)"],
  ["snitt: kort underlag < → <=", "const kort = dagar < GRANSER.snittMinDagar;", "const kort = dagar <= GRANSER.snittMinDagar;"],
  ["snitt: extra_tid räknas inte", "for (const e of i.extra) lagg(e.datum, e.minuter);", ""],
  ["snitt: vab likställs med semester", '(r.typ === "semester" || r.typ === "sjuk")', '(r.typ === "semester" || r.typ === "sjuk" || r.typ === "vab")'],
  ["snitt: bara semester likställs", '(r.typ === "semester" || r.typ === "sjuk")', 'r.typ === "semester"'],
  ["snitt: bara sjuk likställs", '(r.typ === "semester" || r.typ === "sjuk")', 'r.typ === "sjuk"'],
  ["snitt: röda dagar räknas som frånvarodagar", "if (dow === 0 || dow === 6 || roda[d]) continue;", "if (dow === 0 || dow === 6) continue;"],
  ["snitt: helger räknas som frånvarodagar", "if (dow === 0 || dow === 6 || roda[d]) continue;", "if (roda[d]) continue;"],
  ["snitt: arbete vinner inte", "if (heldag[d] && !arArbetsdag(min))", "if (heldag[d])"],
  ["snitt: deldag ignoreras", "else if (deldag[d]) franvaroTimmar += deldagTimmar(GRANSER.vardagH, min);", ""],
  ["snitt: frånvaro räknas inte med i timmar", "const timmar = arbetadMin / 60 + franvaroTimmar;", "const timmar = arbetadMin / 60;"],
  ["snitt: fönstret börjar före förarens första dag", "const fran = forsta;", "const fran = fonsterStart;"],
  // vila
  ["vila: gammalt brott räknas (fran-gräns <)", "if (d.datum < fran || !(d.max_h > 0)) continue;   // pass efter tomDatum är redan bortfiltrerade ovan", "if (d.datum <= fran || !(d.max_h > 0)) continue;   // pass efter tomDatum är redan bortfiltrerade ovan"],
  ["vila: pass efter tomDatum räknas", "const pass = i.dagar.filter(d => d.datum <= tom)", "const pass = i.dagar"],
  ["vila: 0-h-fönster räknas som brott", "|| !(d.max_h > 0)) continue;", "|| false) continue;"],
  ["veckovila: röd vid <= krav", "vMin.h < vkrav ? \"rod\"", "vMin.h <= vkrav ? \"rod\""],
  ["veckovila: gul vid <= gul-gräns", "vMin.h < vgul ? \"gul\"", "vMin.h <= vgul ? \"gul\""],
  ["veckovila: gul-gräns = krav", "const vgul = r1(vkrav / GRANSER.gulAndel);", "const vgul = vkrav;"],
  ["veckovila: högsta i stället för lägsta dag", "if (!vMin || d.max_h < vMin.h)", "if (!vMin || d.max_h > vMin.h)"],
  ["dygnsvila: kravet ignoreras (alltid gul)", "const rod = dygnIFonster(T.dygnsvila_krav_h).length > 0;", "const rod = false;"],
  ["dygnsvila: varningen ignoreras", "const gul = dygnIFonster(Math.max(T.dygnsvila_varning_h, T.dygnsvila_krav_h)).length > 0;", "const gul = false;"],
  ["dygnsvila: gammalt brott räknas (>= → >)", ".filter(b => b.typ === \"dygnsvila\" && b.datum >= fran && b.vila_h > 0)", ".filter(b => b.typ === \"dygnsvila\" && b.datum > fran && b.vila_h > 0)"],
  ["dygnsvila: äldre än fönstret räknas", ".filter(b => b.typ === \"dygnsvila\" && b.datum >= fran && b.vila_h > 0)", ".filter(b => b.typ === \"dygnsvila\" && b.vila_h > 0)"],
  ["dygnsvila: högsta i stället för lägsta", "(!m || b.vila_h < m.vila_h ? b : m)", "(!m || b.vila_h > m.vila_h ? b : m)"],
  ["vila: perioddagar räknas inte", "medPerioddagSpann(pass, perioder)", "medPerioddagSpann(pass, [])"],
  // årsgränser och restid
  ["extra övertid: ej avdrag för taket", "Math.max(0, ov - tak)", "Math.max(0, ov)"],
  ["taket ur avtalet ignoreras", "const tak = i.tak ?? GRANSER.allmanOvertidAr;", "const tak = GRANSER.allmanOvertidAr;"],
  ["staplar: andel överskrider 1", "andel: tak > 0 ? Math.min(1, ov / tak) : 0,", "andel: tak > 0 ? ov / tak : 0,"],
  ["restid: fel aktivitet", 'e.aktivitet_typ === "restid"', 'e.aktivitet_typ === "flytt"'],
  ["restid: äldre än fyra månader räknas", "e.datum >= restFran && e.datum <= i.tomDatum", "e.datum <= i.tomDatum"],
  ["restid: startdag exklusive → inklusive", "const restFran = plusDagar(minusManader(i.tomDatum, GRANSER.snittManader), 1);", "const restFran = plusDagar(minusManader(i.tomDatum, GRANSER.snittManader), -1);"],
  ["förare: värsta nivån = bästa", "varre(v, g.niva)", "(NIVA_RANG[v] <= NIVA_RANG[g.niva] ? v : g.niva)"],
  ["dataFranDatum: årets början ignoreras", "[`${tomDatum.slice(0, 4)}-01-01`, minusManader(tomDatum, GRANSER.snittManader)].sort()[0]", "minusManader(tomDatum, GRANSER.snittManader)"],
  ["dataFranDatum: fyra månader ignoreras", "[`${tomDatum.slice(0, 4)}-01-01`, minusManader(tomDatum, GRANSER.snittManader)].sort()[0]", "`${tomDatum.slice(0, 4)}-01-01`"],
  // sortering
  ["sortering: lugna förare tas med", 'f.varsta !== "lugn"', "true"],
  ["sortering: gula före röda", "NIVA_RANG[b.varsta] - NIVA_RANG[a.varsta]", "NIVA_RANG[a.varsta] - NIVA_RANG[b.varsta]"],
  ["sortering: närmast gränsen sist", "|| narmast(b) - narmast(a)", "|| narmast(a) - narmast(b)"],
];

const raknaForekomster = (s, d) => (d ? s.split(d).length - 1 : 0);
const kor = () => spawnSync("npx", ["vitest", "run", TEST, "--reporter=dot"], { encoding: "utf8", env: { ...process.env, CI: "1" } });

let overlevde = [];
let dog = 0;
try {
  // Utgångsläget måste vara grönt, annars säger "rött" ingenting.
  const grund = kor();
  if (grund.status !== 0) { console.error("Testerna är röda innan mutationerna — rätta dem först.\n" + grund.stdout + grund.stderr); process.exit(2); }

  for (const [namn, fran, till] of M) {
    const n = raknaForekomster(original, fran);
    if (n !== 1) { console.error(`✗ "${namn}": mönstret finns ${n} gånger (ska vara exakt 1):\n   ${fran}`); process.exit(2); }
    writeFileSync(FIL, original.replace(fran, () => till));
    const r = kor();
    const dod = r.status !== 0;
    if (dod) dog++; else overlevde.push(namn);
    console.log(`${dod ? "död     " : "ÖVERLEVDE"}  ${namn}`);
  }
} finally {
  writeFileSync(FIL, original);
}
const allt = M.length;
console.log(`\n${dog} av ${allt} mutanter dödades${overlevde.length ? `, ${overlevde.length} överlevde:` : "."}`);
for (const n of overlevde) console.log("  - " + n);
process.exit(overlevde.length ? 1 : 0);
