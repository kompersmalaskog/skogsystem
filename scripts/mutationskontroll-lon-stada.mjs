// Mutationskontroll för Lön-städningen (2026-10-17): kodrådet byggs ur vad som är kopplat, utjämningsraden är EN per period,
// Fortnox-namnet fylls i av koden, "Skicka utan raderna" är tydlig, rasten avrundas med EN regel. Varje del ska bli RÖD när EN sak
// ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
//
// Kör:  node scripts/mutationskontroll-lon-stada.mjs   (EN tung körning åt gången)
//       Dela upp med MUT_FRAN=0 MUT_TILL=10 om tidsgränsen är kort.
import { kor } from "./mutationsmotor.mjs";

const ATT = "lib/lonesystem/attTaMed.ts";
const VY = "lib/admin/arsovertidVy.ts";
const KORT = "components/admin/ArsovertidKort.tsx";
const LON = "components/admin/LonFlik.tsx";
const ARK = "components/admin/LonearterUnderflik.tsx";
const NAMN = "lib/lonesystem/fortnoxNamn.ts";
const DLG = "components/admin/LoneraderForhandsvisning.tsx";
const RAST = "lib/rastMin.ts";
const RUT = "app/api/mom-import/route.ts";

// Admin.render är stor: bara de beskrivningar som rör städningen körs (-t är ett regex över hela testnamnet).
const ADMIN_T = "Att ta med löneansvarig|Utjämningsperiod: EN rad|Namnet i Fortnox fylls i|Skicka utan|SPÄRRAD|Tillbaka ur det andra|Lönearter: vad i appen";
const kommando = ["bash", "-c", [
  "npx vitest run lib/lonesystem/attTaMed.test.ts lib/lonesystem/fortnoxNamn.test.ts lib/admin/arsovertidVy.test.ts lib/rastMin.test.ts --reporter=dot",
  `npx vitest run components/admin/Admin.render.test.tsx -t '${ADMIN_T}' --reporter=dot`,
].join(" && ")];

const M = [
  // ── Att ta med löneansvarig ──
  ["kodrådet ignorerar vad som är kopplat (visas alltid)", "!kopplingar?.[a.key] &&", "true &&", ATT],
  ["frivilliga lönearter (premien) räknas som saknade", "!a.valfri && ", "", ATT],
  ["det som redan stoppar sändningen står en andra gång", " && !(blockerande || []).some(b => b.loneart === a.key)", "", ATT],
  ["alltid 'koden' (aldrig flera)", 'saknas.length === 1 ? "koden" : "koderna"', '"koden"', ATT],
  ["uppräkningen saknar 'och'", '`${namn.slice(0, -1).join(", ")} och ${namn[namn.length - 1]}`', 'namn.join(", ")', ATT],
  ["kortet bygger inte kodrådet ur kopplingarna", "[kodRadAttGora(kopplingar, blockerande), ...oppnaFragor]", "[...oppnaFragor]", LON],
  ["helglönsbeslutet är en öppen fråga igen", '  { slag: "Bekräfta", rubrik: "Bytesdag är skoftning"', '  { slag: "Martins beslut", rubrik: "Röd vardag ger alltid 8 tim helglön", text: "klart." },\n  { slag: "Bekräfta", rubrik: "Bytesdag är skoftning"', ATT],

  // ── Utjämningsperiod: EN rad ──
  ["samma period per förare räknas som olika perioder", "const k = `${u.startdatum.slice(0, 10)}|${u.slutdatum.slice(0, 10)}`", "const k = `${u.startdatum.slice(0, 10)}|${u.slutdatum.slice(0, 10)}|${u.medarbetare_id}`", VY],
  ["antal dagar räknar fel (en för lite)", "/ 86400000) + 1", "/ 86400000)", VY],
  ["årsövertidskortet visar alla rader", "unikaUtjamningar(svar.utjamning)", "(svar.utjamning || [])", KORT],
  ["granskningen visar alla rader per förare", "unikaUtjamningar(m.utjamning).map(", "(m.utjamning || []).map(", LON],
  ["raden visar ingen plats", '? ` (${plats})` : ""', '? "" : ""', VY],

  // ── Fortnox-namnet fylls i av koden ──
  ["ett eget namn skrivs över när koden ändras", "    if (namnEgen) return;\n", "", ARK],
  ["ett automatiskt namn blir kvar när koden blir okänd", '    else if (autoNamn) { setNamn(""); setAutoNamn(false); }\n', "", ARK],
  ["koden fyller aldrig i namnet", "if (forslag) { setNamn(forslag); setAutoNamn(true); }", "if (false) { setNamn(forslag); setAutoNamn(true); }", ARK],
  ["arket säger inte att namnet fylldes i", "hint={autoNamn ? `Fylldes i automatiskt för kod ${kodRen}. Du kan ändra det.` : \"Så vet alla vad koden betyder.\"}", 'hint="Så vet alla vad koden betyder."', ARK],
  ["fel namn för 147", '"147": "OB tillägg natt",', '"147": "OB",', NAMN],
  ["fel namn för 1462", '"1462": "Helglön, timmar 2",', '"1462": "Helglön, timmar",', NAMN],
  ["okänd kod ger ett påhittat namn", ': "";\n}', ': "Okänd löneart";\n}', NAMN],

  // ── Skicka utan raderna ──
  ["dialogen säger inte att raderna aldrig skickas senare", "<strong>Raderna skickas aldrig senare.</strong>", "<strong>Raderna följer inte med.</strong>", DLG],
  ["dialogen säger inte vem som lägger in dem", "Lönehanteraren måste lägga in dem för hand i Fortnox.", "Lägg in dem.", DLG],
  ["dialogen listar inte vad som uteblir", "{utan.map(u => <React.Fragment key={u}><br />• {u}</React.Fragment>)}", "", DLG],

  // ── Rasten: EN regel ──
  ["rasten trunkeras", "return Math.floor((s + 30) / 60);", "return Math.floor(s / 60);", RAST],
  ["halv minut går nedåt", "return Math.floor((s + 30) / 60);", "return Math.ceil((s - 30) / 60) < 0 ? 0 : Math.ceil((s - 30) / 60);", RAST],
  ["rutten räknar rasten på eget sätt (fallback)", "const rastMin = rastMinFranSek(agg.rastSek);", "const rastMin = Math.floor(agg.rastSek / 60);", RUT],
  ["rutten räknar rasten på eget sätt (dagrad)", "const rastMin = rastMinFranSek(rastSek);", "const rastMin = Math.floor(rastSek / 60);", RUT],
];

kor({
  filer: [ATT, VY, KORT, LON, ARK, NAMN, DLG, RAST, RUT],
  tester: [],
  kommando,
  standardFil: ATT,
  mutationer: M.slice(Number(process.env.MUT_FRAN ?? 0), Number(process.env.MUT_TILL ?? M.length)),
});
