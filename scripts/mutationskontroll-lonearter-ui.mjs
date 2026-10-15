// Mutationskontroll för lönearternas gränssnitt (Lön → Lönearter och förhandsvisningen före export). Varje spärr i sidan och dialogen ska bli
// RÖD i Admin.render.test.tsx när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs (testkommando via `kommando`).
//
// Kör:  node scripts/mutationskontroll-lonearter-ui.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
//       En körning tar ~90 s per mutant; dela upp med MUT_FRAN=5 MUT_TILL=9 (ett urval ur listan) om tidsgränsen är kort.
//       Avbryts den mitt i kan en mutant ligga kvar i källan: kontrollera att varje mönster finns exakt en gång innan du committar.
import { kor } from "./mutationsmotor.mjs";

const SIDA = "components/admin/LonearterUnderflik.tsx";
const RAD = "components/admin/LoneraderForhandsvisning.tsx";
const FLIK = "components/admin/LonFlik.tsx";

const M = [
  // ── Lönearter-sidan ──
  ["tom kod tar inte bort kopplingen", 'if (!kod) {\n        const { data, error } = await supabase.from("lonesystem_artikelmappning").delete()', 'if (false) {\n        const { data, error } = await supabase.from("lonesystem_artikelmappning").delete()', SIDA],
  ["Spara är aktiv utan ändring (dirty-state borta)", "const kanSpara = andrat && !ogiltig && !upptagen;", "const kanSpara = !ogiltig && !upptagen;", SIDA],
  ["vilken kod som helst godkänns", "const GILTIG_KOD = /^[A-Za-z0-9_-]{1,12}$/;", "const GILTIG_KOD = /^.{1,12}$/;", SIDA],
  ["frivilliga lönearter räknas som saknade", "LONEARTER.filter(a => !a.valfri && !rader[a.key])", "LONEARTER.filter(a => !rader[a.key])", SIDA],
  ["ny koppling skrivs utan Fortnox-kopplingen (exporten hittar den aldrig)", ".insert({ lonesystem_id: koppling.id, intern_typ: key,", ".insert({ intern_typ: key,", SIDA],
  ["stoppad skrivning (RLS) tystas vid ändring", '.update({ extern_kod: kod, beskrivning: namn }).eq("id", befintlig.id).select("id");\n        if (error) return error.message;\n        if (!data?.length) return IGEN_RAD;', '.update({ extern_kod: kod, beskrivning: namn }).eq("id", befintlig.id).select("id");\n        if (error) return error.message;', SIDA],
  ["samma kod varnas inte för", "andraKoder.find(a => a.kod === kodRen)", "undefined", SIDA],
  ["läsfel ser ut som 'allt är ej kopplat'", "setRader(null);\n      setFel(e?.message || String(e));", "setRader({});\n      setFel(e?.message || String(e));", SIDA],
  ["skrivning utan Fortnox-koppling går igenom", 'if (!koppling) return "Anslut Fortnox först', 'if (false) return "Anslut Fortnox först', SIDA],

  // ── förhandsvisningen ──
  ["spärrad dialog visar ändå Skicka till Fortnox", "{!spard && (", "{true && (", RAD],
  ["första trycket på 'Skicka utan dessa rader' skickar direkt (inget andra steg)", '<Tertiar smal onClick={() => setSteg("bekrafta")}>', "<Tertiar smal onClick={() => onSkicka(true)}>", RAD],
  ["röd rad visas inte", '{r.status === "saknar_kod" && (', "{false && (", RAD],
  ["frivillig rad visas inte", '{r.status === "valfri_utan_kod" && (', "{false && (", RAD],
  ["Fortnox-namnet visas inte bredvid koden", "{r.kod}{k?.namn ? ` · ${k.namn}` : \"\"}", "{r.kod}", RAD],
  ["spärrkortet visas även utan röda rader", "if (blockerande.length === 0) return null;", "if (false) return null;", RAD],
  ["Koppla koder gör ingenting", "<Primar onClick={onKoppla} style={{ marginTop: AVSTAND.m }}>", "<Primar onClick={() => {}} style={{ marginTop: AVSTAND.m }}>", RAD],
  ["begäran bär flaggan alltid", "skickaUtanSaknade ? { period, skicka_utan_saknade: true } : { period }", "{ period, skicka_utan_saknade: true }", FLIK],
  ["period ur adressen tar vilken text som helst", "/^\\d{4}-(0[1-9]|1[0-2])$/.test(p)", "/^.+$/.test(p)", FLIK],
  ["resultatet säger inte vad som uteblev", "exportResultat.utelamnade?.length > 0 && (", "false && (", FLIK],
  ["fliken Lönearter visas inte", '{aktiv === "lonearter" && <LonearterUnderflik />}', '{false && <LonearterUnderflik />}', FLIK],
  ["samma varning står två gånger (rad + 'Påverkar riktigheten')", "|^Helglön|^Löneart saknas|skickas inte: ingen kod är kopplad/i.test(v)", "|^Helglön/i.test(v)", FLIK],
  ["Fortnox-namnet visas utan 'I Fortnox:' (ser ut som en dubblett)", "`I Fortnox: ${m.beskrivning!.trim()}`", "m.beskrivning", SIDA],
];

kor({
  filer: [SIDA, RAD, FLIK],
  tester: [],
  standardFil: SIDA,
  mutationer: M.slice(Number(process.env.MUT_FRAN ?? 0), Number(process.env.MUT_TILL ?? M.length)),
  kommando: ["npx", "vitest", "run", "components/admin/Admin.render.test.tsx", "-t", "Lönearter: vad i appen|Löneunderlag: förhandsvisning rad för rad", "--reporter=dot"],
});
