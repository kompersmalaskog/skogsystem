// Mutationskontroll för Admin-granskningen (2026-10-17): arbetsmånaden som huvudnamn, svaret först i Löneunderlag och Dagar, en knapp (Öppna)
// i Översikten, grupper i Medarbetare, EN fråga om datan i Maskiner, färre ord i Lönesystem/Lönearter/Avtal. Varje del ska bli RÖD när EN sak
// ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
//
// Kör:  node scripts/mutationskontroll-admin-granskning.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
//       Dela upp med MUT_FRAN=0 MUT_TILL=15 om tidsgränsen är kort.
import { kor } from "./mutationsmotor.mjs";

const MAN = "lib/lonesystem/lonemanad.ts";
const TOK = "lib/lonesystem/tokenStatus.ts";
const LVY = "lib/admin/loneunderlagVy.ts";
const ARS = "lib/admin/arsovertidVy.ts";
const AG = "lib/admin/attGora.ts";
const LON = "components/admin/LonFlik.tsx";
const DAG = "components/admin/DagarUnderflik.tsx";
const OV = "components/admin/Oversikt.tsx";
const KORT = "components/admin/ArsovertidKort.tsx";
const MF = "components/admin/MedarbetareFlik.tsx";
const MK = "components/admin/MaskinerFlik.tsx";
const LS = "components/admin/LonesystemUnderflik.tsx";
const LA = "components/admin/LonearterUnderflik.tsx";
const VIL = "components/admin/VilobrottUnderflik.tsx";
const AV = "components/admin/AvtalFlik.tsx";
const ARB = "components/arbetsrapport/Arbetsrapport.tsx";

const ADMIN_T = "Granskningen|Lön → Dagar|Löneunderlag|Översikt|Lönearter|Delägare|Årsövertid|Lönesystem|Medarbetare";
const kommando = ["bash", "-c", [
  "npx vitest run lib/lonesystem/lonemanad.test.ts lib/lonesystem/tokenStatus.test.ts lib/admin/loneunderlagVy.test.ts lib/admin/arsovertidVy.test.ts lib/admin/attGora.test.ts --reporter=dot",
  `npx vitest run components/admin/Admin.render.test.tsx -t '${ADMIN_T}' --reporter=dot`,
  "npx vitest run components/arbetsrapport/Arbetsrapport.render.test.tsx -t 'Min månad' --reporter=dot",
].join(" && ")];

const M = [
  // ── Arbetsmånaden är namnet, utbetalningen i liten text ──
  ["utbetalningen räknas från arbetsmånaden i stället för månaden efter", "const [å, m] = loneperiodForArbetsManad(arbetsManad).split(\"-\").map(Number);", "const [å, m] = arbetsManad.split(\"-\").map(Number);", MAN],
  ["lönen betalas inte den 25:e", "export const LONEDAG = 25;", "export const LONEDAG = 26;", MAN],
  ["Löneunderlaget visar löneperioden som namn", "textTransform: \"capitalize\" }}>{arbetsManadText(arbetsManad)}</div>", "textTransform: \"capitalize\" }}>{arbetsManadText(period)}</div>", LON],
  ["bekräftelsen visar löneperioden som månad", "manadText={arbetsManadText(arbetsManad)}", "manadText={arbetsManadText(period)}", LON],
  ["Dagar visar utbetalningen för kvartal och år", "{period === \"M\" && <div data-utbetalning=\"\"", "{period !== \"M\" && <div data-utbetalning=\"\"", DAG],
  ["Min månad säger inte när lönen betalas", "color:FARG.text2 }}>{utbetalningText(lönePeriod)}</div>\n            </div>", "color:FARG.text2 }}>{\"\"}</div>\n            </div>", ARB],

  // ── Löneunderlag: svaret först ──
  ["svaret säger aldrig 'Klart att skicka'", "antal === 0 ? \"Klart att skicka\"", "antal === -1 ? \"Klart att skicka\"", LON],
  ["de öppna frågorna går inte att öppna", "<Rad rubrik={`${oppnaFragor.length} öppna frågor`} chevron onClick={() => setVisaFragor(true)} sista />", "<Rad rubrik={`${oppnaFragor.length} öppna frågor`} chevron onClick={() => {}} sista />", LON],
  ["kodrådet visas aldrig", "{kodRad && <Rad", "{false && <Rad", LON],
  ["anställningsdatum saknas visas aldrig som en rad", "{saknarDatum.length > 0 && (", "{false && (", LON],
  ["UTKAST visas på varje förare igen", "if (!status || status === \"utkast\") return null;", "if (!status) return null;", LON],
  ["'Se dagen' räknar fel månad", "(å - nu.getFullYear()) * 12 + (m - 1 - nu.getMonth())", "(å - nu.getFullYear()) * 12", LON],
  ["rast-raden saknar knapp till dagen", "kolla(`rast-${r.datum}`, `${dagText(r.datum)}: rast ${r.rast_min} min${stopp}`, dagar, \"Se dagen\")", "kolla(`rast-${r.datum}`, `${dagText(r.datum)}: rast ${r.rast_min} min${stopp}`)", LVY],
  ["dagar utan rast blir en varning igen", "if ((m.obekraftade || 0) > 0)", "if ((m.utan_rast?.dagar || 0) > 0) kolla(\"utan-rast\", `${m.utan_rast.dagar} dagar utan rast`, dagar, \"Se dagen\");\n  if ((m.obekraftade || 0) > 0)", LVY],
  ["helglönens orsak visas inte", "if (h.ger === false) kort.helglon.push(", "if (false) kort.helglon.push(", LVY],
  ["frånvarovarningen visas rå (med 'tjanstledig')", "if (fr) info(`fr-${i}`, fr); else info(`v-${i}`, v);", "info(`v-${i}`, v);", LVY],
  ["årsövertiden visar alla förare", "export const VISA_FRAN_ANDEL = 0.5", "export const VISA_FRAN_ANDEL = 0", ARS],
  ["utjämningsraden visas för månader den inte berör", ".filter(u => !manad || overlapparManad(u, manad))", "", KORT],

  // ── Dagar: svaret först ──
  ["Dagar öppnar med alla dagar", "useState(nav.params.avv !== \"0\")", "useState(nav.params.avv === \"1\")", DAG],
  ["rast noll är en info-rad på varje pass", "rastSaknas(r.d.arbetad_min, r.d.rast_min) ? RAST_SAKNAS_INFO : null", "true ? RAST_SAKNAS_INFO : null", DAG],
  ["tekniska ordet 'utan objekt' syns", "(a === \"utan objekt\" ? \"ingen trakt\"", "(a === \"utan objekt\" ? \"utan objekt\"", DAG],
  ["summeringen står under avvikelselistan", "{!baraAvv && visade.length > 0 && (", "{visade.length > 0 && (", DAG],

  // ── Översikt: en knapp, ett ord ──
  ["lönerutan heter Granska igen", "knapp: \"Öppna\", mal: { typ: \"flik\", flik: \"lon\", underflik: \"underlag\" },", "knapp: \"Granska\", mal: { typ: \"flik\", flik: \"lon\", underflik: \"underlag\" },", AG],
  ["'nära gränsen' visas utan att något är över", "const over = forare.some(f => f.varsta === \"rod\");", "const over = forare.some(f => f.varsta !== \"lugn\");", AG],
  ["delägare visas i Arbetstid", ".filter(f => !f.foretagsledare);\n    const over", ";\n    const over", AG],
  ["'Allt stämmer' fälls inte ihop", "{stammerOppen && att.stammer.map(", "{att.stammer.map(", OV],
  ["'Allt annat stämmer' heter alltid 'Allt stämmer'", "att.saker.length > 0 || att.arbetstid.length > 0 ? \"Allt annat stämmer\" : \"Allt stämmer\"", "\"Allt stämmer\"", OV],

  // ── Medarbetare, Maskiner ──
  ["admin får 'ingen koppling till maskinfilerna'", "const utanKoppling = m.roll === \"forare\" && ops.length === 0;", "const utanKoppling = ops.length === 0;", MF],
  ["Spara är aktiv utan ändring", "<Lank onClick={spara} disabled={!ändrat || sparar}>{sparar ? \"Sparar…\" : \"Spara\"}</Lank>", "<Lank onClick={spara} disabled={sparar}>{sparar ? \"Sparar…\" : \"Spara\"}</Lank>", MF],
  ["datakällan blir aldrig 'Ingen data'", "(manuell ? \"manuellt\" : sanderFiler ? \"filer\" : \"ingen\")", "(manuell ? \"manuellt\" : \"filer\")", MK],
  ["'Ingen data' sparas som manuell", "setManuellKalla(v === \"manuellt\");", "setManuellKalla(v !== \"filer\");", MK],
  ["Öppna som maskin visas för en obekräftad maskin", "{!maskin.aktiv_till && !obekraftad && (", "{true && (", MK],

  // ── Lönesystem, Lönearter, Vilobrott, Avtal ──
  ["Stub-system visas igen", "[\"fortnox\", \"csv\"].filter(", "[\"fortnox\", \"csv\", \"visma\"].filter(() => true).filter(", LS],
  ["token som går ut om månader visas", "export const TOKEN_VARNING_DAGAR = 14;", "export const TOKEN_VARNING_DAGAR = 4000;", TOK],
  ["igår skrivs som idag", "if (skillnad === 1) return `igår ${kl}`;", "if (skillnad === 1) return `idag ${kl}`;", TOK],
  ["företagsledare räknas som saknar anställningsnummer", "m.foretagsledare !== true && !(anstallningar[m.id] || \"\").trim()", "!(anstallningar[m.id] || \"\").trim()", LS],
  ["namnet i Fortnox upprepas när det är samma som rubriken", "return namn.toLowerCase() === label.toLowerCase() ? undefined :", "return false ? undefined :", LA],
  ["kolonet i Fortnox-namnet visas", ".replace(/:\\s*$/, \"\")", "", LA],
  ["metodtexten står före svaret i Vilobrott", "{visaMetod && (", "{true && (", VIL],
  ["Tidigare avtal visas tomt", "{historik.length > 0 && (", "{true && (", AV],
  ["avtalsnamnet klipps", "fält.type === \"text\" ? 280 : 120", "fält.type === \"text\" ? 200 : 120", AV],
  ["gruppen heter inte det den innehåller", "rubrik: \"Resor\",", "rubrik: \"Färdmedel & färdtid\",", AV],
  ["Spara är aktiv utan ändring i Avtal", "<Lank onClick={spara} disabled={!ändrat || sparar} style={{ marginBottom: AVSTAND.m }}>", "<Lank onClick={spara} disabled={sparar} style={{ marginBottom: AVSTAND.m }}>", AV],
];

kor({
  filer: [MAN, TOK, LVY, ARS, AG, LON, DAG, OV, KORT, MF, MK, LS, LA, VIL, AV, ARB],
  tester: [],
  kommando,
  standardFil: LON,
  mutationer: M.slice(Number(process.env.MUT_FRAN ?? 0), Number(process.env.MUT_TILL ?? M.length)),
});
