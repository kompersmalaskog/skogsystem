// Mutationskontroll för lib/arbetstidsgranser.ts (lag och lön: testnivå full).
//
// Ändrar EN sak i taget i gränslogiken — en tröskel, en jämförelse, en sorts frånvaro, ett datumavdrag — kör
// lib/arbetstidsgranser.test.ts och kräver att testerna blir RÖDA. En mutant som överlever betyder att en gräns kan flyttas
// utan att något test märker det. Originalfilen återställs alltid (även vid avbrott); scriptet avslutar med 1 om någon överlevde.
//
// Filerna återställs alltid, även när skriptet avbryts av ett fel i mönstren (aterstall() före varje process.exit — en finally körs inte då).
// Kör:  node scripts/mutationskontroll-arbetstid.mjs         (EN tung körning åt gången: kör inte tillsammans med tsc/build)
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const FIL = "lib/arbetstidsgranser.ts";
const VILA = "lib/vilobrott.ts";
const TEST = "lib/arbetstidsgranser.test.ts";
const originalFil = { [FIL]: readFileSync(FIL, "utf8"), [VILA]: readFileSync(VILA, "utf8") };

/** [namn, från, till, fil?] — `från` måste finnas EXAKT en gång i filen (annars är mutationen tvetydig och scriptet stannar). Standardfil: lib/arbetstidsgranser.ts. */
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
  ["vila: gammalt brott räknas (fran-gräns <)", "if (d.datum < fran) continue;", "if (d.datum <= fran) continue;"],
  ["vila: pass efter tomDatum räknas", "const pass = i.dagar.filter(d => d.datum <= tom)", "const pass = i.dagar"],
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
  // veckovilans ändar och nattpass (lib/vilobrott.ts) — kortet sätter flaggorna, testerna ska se skillnaden
  ["vila: ledande vila (före första passet) räknas inte", "if (forstaStart > wsT) maxMs = forstaStart - wsT;", "if (false) maxMs = forstaStart - wsT;", VILA],
  ["vila: avslutande vila (efter sista passet, till nu) räknas inte", "if (nuT > cursor && nuT > wsT && cursor < weT && nuT - cursor > maxMs) maxMs = nuT - cursor;", "if (false) maxMs = nuT - cursor;", VILA],
  ["vila: avslutande vila räknas även när den inte överlappar fönstret", "if (nuT > cursor && nuT > wsT && cursor < weT && nuT - cursor > maxMs)", "if (nuT > cursor && nuT - cursor > maxMs)", VILA],
  ["vila: ett enda pass ger ingen ledande/avslutande vila", "if (intervaller.length < 2 && !andar) return 0;", "if (intervaller.length < 2) return 0;", VILA],
  ["dygnsvila: pass över midnatt slutar samma dygn", "if (start1 && slut1.h * 60 + slut1.m <= start1.h * 60 + start1.m) d1 = new Date(d1.getTime() + 86400000);", "", VILA],
  ["dygnsvila: pass över midnatt, <= → <", "slut1.h * 60 + slut1.m <= start1.h * 60 + start1.m", "slut1.h * 60 + slut1.m < start1.h * 60 + start1.m", VILA],
  // kortets anrop av ändarna
  ["veckovila: kortet sätter inte vilaForeForstaPass", "{ nu, vilaForeForstaPass: true }", "{ nu }"],
  ["veckovila: kortet skickar inte nu", "{ nu, vilaForeForstaPass: true }", "{ vilaForeForstaPass: true }"],
  ["dygnsvila: kortet sätter inte passOverMidnatt", "{ passOverMidnatt: true }", "{}"],
  ["veckovila: visas över fönstret (168-taket borta)", "Math.min(vMin.h, T.veckovila_fonster_dagar * 24)", "vMin.h"],
  ["nu: väggklocka i fel tidszon (UTC i stället för Stockholm)", 'timeZone: "Europe/Stockholm", year', 'timeZone: "UTC", year'],
  // maskinflytt
  ["flytt: skräpgräns 16 → 17 tim", "export const FLYTT_MAX_MIN = 16 * 60;", "export const FLYTT_MAX_MIN = 17 * 60;"],
  ["flytt: skräpgräns 16 → 15 tim", "export const FLYTT_MAX_MIN = 16 * 60;", "export const FLYTT_MAX_MIN = 15 * 60;"],
  ["flytt: 0 min räknas", "if (min == null || !(min > 0) || min > FLYTT_MAX_MIN)", "if (min == null || min > FLYTT_MAX_MIN)"],
  ["flytt: över gränsen räknas (> → >=)", "min > FLYTT_MAX_MIN)", "min >= FLYTT_MAX_MIN)"],
  ["flytt: pågående dag räknas inte", "else if (!r.sluttid && nu) min = Math.round((nu.getTime() - start.getTime()) / 60000);", ""],
  ["flytt: avslutad dag utan mätt tid räknas som pågående", "else if (!r.sluttid && nu)", "else if (nu)"],
  ["flytt: fönstret (lokalt datum, från) ignoreras", "lokalStart.datum < fonster.fran || lokalStart.datum > fonster.till", "lokalStart.datum > fonster.till"],
  ["flytt: fönstret (lokalt datum, till) ignoreras", "lokalStart.datum < fonster.fran || lokalStart.datum > fonster.till", "lokalStart.datum < fonster.fran"],
  ["flytt: slutMin = start + 0", "slutMin: lokalStart.min + min, min", "slutMin: lokalStart.min, min"],
  ["flytt: tim-summan utan nettning mot underlaget (dubbelräkning)", "lagg(f.datum, flyttNettoMin(f, i.dagar, i.extra));", "lagg(f.datum, f.min);"],
  ["flytt: nettning ignorerar extra_tid", "for (const e of extra) if (e.datum === f.datum) { const r = tidsrad(e.start_tid, e.slut_tid); if (r) befintliga.push(r); }", ""],
  ["flytt: nettning ignorerar maskinpass", "for (const d of dagar) if (d.datum === f.datum) { const r = tidsrad(d.start_tid, d.slut_tid); if (r) befintliga.push(r); }", ""],
  ["flytt: överlapp räknas bara från flyttens start", "Math.max(0, Math.min(e, f.slutMin) - Math.max(s, f.startMin))", "Math.max(0, Math.min(e, f.slutMin) - f.startMin)"],
  ["flytt: förlänger inte dagens pass (start)", "const s = Math.min(r[0], f.s);", "const s = r[0];"],
  ["flytt: förlänger inte dagens pass (slut)", "slut_tid: hhmm(Math.max(r[1], f.e)) };", "slut_tid: hhmm(r[1]) };"],
  ["flytt: blir inte eget pass där inget pass finns", "perDatum.forEach((f, datum) => { if (!harPass.has(datum)) ut.push(", "perDatum.forEach((f, datum) => { if (false) ut.push("],
  ["flytt: flyttdagar läggs inte till i vilan", "const spann = medFlyttSpann(medPerioddagSpann(pass, perioder), flyttPass);", "const spann = medPerioddagSpann(pass, perioder);"],
  ["flytt: flyttdagar läggs inte till i snittet", "for (const f of flyttdagTillPass(i.flytt || [], i.nu, { fran: fonsterStart, till: i.tomDatum }).pass)", "for (const f of [] as FlyttPass[])"],
  ["flytt: pågående flytt räknas utan nu i vilan", "flyttdagTillPass(i.flytt || [], i.nu, { fran: plusDagar(fran, -8), till: tom }).pass", "flyttdagTillPass(i.flytt || [], undefined, { fran: plusDagar(fran, -8), till: tom }).pass"],
  ["flytt: restidSaknas ignorerar flytt", "const restidSaknas = !harRestid && flytt.pass.length === 0;", "const restidSaknas = !harRestid;"],
  ["flytt: restidSaknas ignorerar registrerad restid", "const restidSaknas = !harRestid && flytt.pass.length === 0;", "const restidSaknas = flytt.pass.length === 0;"],
  ["flytt: flyttnotisen saknas", "if (flytt.pass.length > 0) {\n    const n = flytt.pass.length;", "if (false) {\n    const n = flytt.pass.length;"],
  ["flytt: flyttnotisens timmar = dagar", "const h = flytt.pass.reduce((s, f) => s + f.min, 0) / 60;", "const h = flytt.pass.length;"],
  ["flytt: notisen om uteslutna dagar saknas", "if (flytt.uteslutna > 0) notiser.push(", "if (false) notiser.push("],
  ["flytt: restidsnotisen läggs sist i stället för först", "if (restidSaknas) notiser.unshift(RESTID_NOTIS);", "if (restidSaknas) notiser.push(RESTID_NOTIS);"],
  // företagsledare / delägare (arbetstidslagen gäller inte)
  ["delägare: varsta blir ändå gul/röd", 'varsta: "lugn", foretagsledare: true, skulleVarit: varsta,', "varsta, foretagsledare: true, skulleVarit: varsta,"],
  ["delägare: skulleVarit alltid lugn (visas aldrig)", 'foretagsledare: true, skulleVarit: varsta,', 'foretagsledare: true, skulleVarit: "lugn" as Niva,'],
  ["delägare: tas med bland de flaggade", ".filter(f => !f.foretagsledare && f.varsta !== \"lugn\")", ".filter(f => f.varsta !== \"lugn\")"],
  ["delägare: visas även när de inte skulle varit gula/röda", "f.foretagsledare && f.skulleVarit != null && f.skulleVarit !== \"lugn\"", "f.foretagsledare"],
  ["delägare: kommer först i stället för sist", "return [...flaggade, ...delagare];", "return [...delagare, ...flaggade];"],
  // sortering
  ["sortering: lugna förare tas med", 'f.varsta !== "lugn"', "true"],
  ["sortering: gula före röda", "NIVA_RANG[b.varsta] - NIVA_RANG[a.varsta]", "NIVA_RANG[a.varsta] - NIVA_RANG[b.varsta]"],
  ["sortering: närmast gränsen sist", "|| narmast(b) - narmast(a)", "|| narmast(a) - narmast(b)"],
];

const raknaForekomster = (s, d) => (d ? s.split(d).length - 1 : 0);
const aterstall = () => { for (const [fil, innehall] of Object.entries(originalFil)) writeFileSync(fil, innehall); };
const kor = () => spawnSync("npx", ["vitest", "run", TEST, "--reporter=dot"], { encoding: "utf8", env: { ...process.env, CI: "1" } });

let overlevde = [];
let dog = 0;
try {
  // Utgångsläget måste vara grönt, annars säger "rött" ingenting.
  const grund = kor();
  if (grund.status !== 0) { console.error("Testerna är röda innan mutationerna — rätta dem först.\n" + grund.stdout + grund.stderr); aterstall(); process.exit(2); }

  for (const [namn, fran, till, fil = FIL] of M) {
    const original = originalFil[fil];
    const n = raknaForekomster(original, fran);
    if (n !== 1) { console.error(`✗ "${namn}": mönstret finns ${n} gånger i ${fil} (ska vara exakt 1):\n   ${fran}`); aterstall(); process.exit(2); }
    aterstall();
    writeFileSync(fil, original.replace(fran, () => till));
    const r = kor();
    const dod = r.status !== 0;
    if (dod) dog++; else overlevde.push(namn);
    console.log(`${dod ? "död     " : "ÖVERLEVDE"}  ${namn}`);
  }
} finally {
  aterstall();
}
const allt = M.length;
console.log(`\n${dog} av ${allt} mutanter dödades${overlevde.length ? `, ${overlevde.length} överlevde:` : "."}`);
for (const n of overlevde) console.log("  - " + n);
aterstall();
process.exit(overlevde.length ? 1 : 0);
