// Mutationskontroll för lönearterna (lön/export, testnivå full): varje spärr i beräkningen, löneartskatalogen, spärr-sammanställningen,
// exportroutens stopp och förarens text ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
//
// Täcker: tom kod, fel kod, premielön saknas (frivillig), helglön med/utan kod, "skicka utan dessa rader" måste vara uttryckligt.
// UI-delen (Lönearter-sidan och förhandsvisningen) ligger i scripts/mutationskontroll-lonearter-ui.mjs.
//
// Kör:  node scripts/mutationskontroll-lonearter.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
import { kor } from "./mutationsmotor.mjs";

const BER = "lib/lonesystem/loneberakning.ts";
const ART = "lib/lonesystem/loneart.ts";
const SAK = "lib/lonesystem/loneartSaknas.ts";
const RUT = "app/api/fortnox/salary-export/route.ts";
const FOR = "lib/lonesystem/forarText.ts";

const TESTER = [
  "lib/lonesystem/loneart.test.ts",
  "lib/lonesystem/loneberakning.koder.test.ts",
  "lib/lonesystem/loneberakning.helglon.test.ts",
  "lib/lonesystem/loneberakning.premie.test.ts",
  "lib/lonesystem/loneartSaknas.test.ts",
  "lib/lonesystem/forarText.test.ts",
  "lib/lonesystem/septemberbytediff.test.ts",
  "app/api/fortnox/salary-export/route.test.ts",
];

const M = [
  // ── tom kod / fel kod ──
  ["tom kod (blanksteg) räknas som en kod", 'const kod = (koder[loneart] || "").trim();', 'const kod = (koder[loneart] || "");', BER],
  ["raden skickas med fel kod", "rader.push({ EmployeeId: eid, loneart, SalaryCode: kod,", 'rader.push({ EmployeeId: eid, loneart, SalaryCode: "11",', BER],
  ["premie skördare skickas som premie skotare", 'laggRad("premielon_skordare", premieSkordare.toFixed(2)', 'laggRad("premielon_skotare", premieSkordare.toFixed(2)', BER],
  ["övertidens art är omvänd", 'const overtidArt: LoneartKey = skordareH >= skotareH ? "overtid_skordare" : "overtid_skotare";', 'const overtidArt: LoneartKey = skordareH >= skotareH ? "overtid_skotare" : "overtid_skordare";', BER],
  ["katalogens trim borta (kod med blanksteg)", 'const kod = (r.extern_kod || "").trim();', 'const kod = (r.extern_kod || "");', ART],
  ["fel system läses (kopplingen hittas inte)", '.eq("system_typ", "fortnox")', '.eq("system_typ", "visma")', ART],
  ["fel koppling läses (inga koder)", '.eq("lonesystem_id", k.data.id)', '.eq("lonesystem_id", "annan")', ART],

  // ── saknad kod ──
  ["saknad kod hamnar inte bland de blockerande", "if (!saknadeKoder.includes(loneart)) saknadeKoder.push(loneart);", "", BER],
  ["rad utan kod försvinner ur förhandsvisningen", 'lonerader.push({ loneart, mangd, kod: null, beskrivning, status: "saknar_kod" });', "", BER],
  ["en rad som skickas märks som saknad", 'lonerader.push({ loneart, mangd, kod, beskrivning, status: "skickas" });', 'lonerader.push({ loneart, mangd, kod, beskrivning, status: "saknar_kod" });', BER],

  // ── premielön frivillig ──
  ["premien är inte längre frivillig (kod-check)", "if (info.valfri) {", "if (false) {", BER],
  ["frivillig utan kod blockerar", 'lonerader.push({ loneart, mangd, kod: null, beskrivning, status: "valfri_utan_kod" });', 'lonerader.push({ loneart, mangd, kod: null, beskrivning, status: "saknar_kod" });', BER],
  ["katalogen: premie skördare är inte frivillig", 'enhetText: "tim",           valfri: true,\n    grupp: "Timlön och övertid",\n    forklaring: "Premie på timlönetimmarna, för tid på skördare.', 'enhetText: "tim",           valfri: false,\n    grupp: "Timlön och övertid",\n    forklaring: "Premie på timlönetimmarna, för tid på skördare.', ART],
  ["katalogen: premie skotare är inte frivillig", 'enhetText: "tim",           valfri: true,\n    grupp: "Timlön och övertid",\n    forklaring: "Premie på timlönetimmarna, för tid på skotare.', 'enhetText: "tim",           valfri: false,\n    grupp: "Timlön och övertid",\n    forklaring: "Premie på timlönetimmarna, för tid på skotare.', ART],
  ["spärren räknar frivilliga som blockerande", 'r.status === "saknar_kod"', 'r.status !== "skickas"', SAK],
  ["spärren räknar redan skickade förare", 'if (m.status === "skickat") continue;', "", SAK],

  // ── helglön med/utan kod ──
  ["helglön skickas aldrig", "if (helglonTimmar > 0) {\n    const antalDagar", "if (false) {\n    const antalDagar", BER],
  ["helglön skickas även när det inte finns någon", "if (helglonTimmar > 0) {\n    const antalDagar", "if (helglonTimmar >= 0) {\n    const antalDagar", BER],
  ["helglön fel antal", "laggRad(\"helglon\", helglonTimmar.toFixed(2),", "laggRad(\"helglon\", (helglonTimmar * 2).toFixed(2),", BER],

  // ── exportroutens stopp och det uttryckliga valet ──
  ["spärren är borta helt", "if (blockerande.length > 0 && !skickaUtanSaknade) {", "if (false) {", RUT],
  ["spärren släpper aldrig igenom (valet ignoreras)", "if (blockerande.length > 0 && !skickaUtanSaknade) {", "if (blockerande.length > 0) {", RUT],
  ["valet är inte längre uttryckligt (vilken sanning som helst räknas)", "body.skicka_utan_saknade === true", "!!body.skicka_utan_saknade", RUT],
  ["stoppet svarar inte 409", "}, { status: 409 });", "}, { status: 200 });", RUT],
  ["förhandsvisningen tappar de blockerande raderna", "blockerande: blockerandeLonearter(resultat),", "blockerande: [],", RUT],
  ["svaret säger inte vilka rader som uteblev", "const utelamnade = blockerande.flatMap(b =>", "const utelamnade = ([] as any[]).flatMap((b: any) =>", RUT],

  // ── förarens text ──
  ["helglön 'går till lönen' även utan kod", 'const helglonGar = lonerader.some(l => l.loneart === "helglon" && l.status === "skickas");', "const helglonGar = true;", FOR],
  ["adminens text läcker till föraren", "/^Löneart saknas/, ", "", FOR],
  ["helglön får en extra post som saknad löneart", ' && l.loneart !== "helglon")) {', ")) {", FOR],
  ["frivillig premie syns för föraren", 'lonerader.filter(l => l.status === "saknar_kod"', 'lonerader.filter(l => l.status !== "skickas"', FOR],
];

kor({
  filer: [BER, ART, SAK, RUT, FOR],
  tester: TESTER,
  standardFil: BER,
  mutationer: M,
});
