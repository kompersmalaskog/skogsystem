// Mutationskontroll för "Instruktioner till föraren" (maskinläget): varje regel — sett per kommentar och hash, larm först, inkörning med hysteres, Vidas text bara på
// hänsynsytor och avlägg, ett Sett, testläget skriver inget, bara maskinläget — ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
//
// Kör:  node scripts/mutationskontroll-instruktioner.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
import { kor } from "./mutationsmotor.mjs";

const LOGIK = "lib/instruktioner/instruktioner.ts";
const SETT = "lib/instruktioner/sett.ts";
const HOOK = "lib/hooks/useInstruktioner.ts";
const KORT = "components/planering/InstruktionKort.tsx";
const OBJ = "components/planering/ObjektKort.tsx";
const SIDA = "app/planering/page.tsx";
const SQL = "supabase/migrations/20261021170000_kommentar_sett_forare.sql";

const TESTER = [
  "lib/instruktioner/instruktioner.test.ts",
  "lib/instruktioner/sett.test.ts",
  "lib/instruktioner/instruktioner.vakter.test.ts",
  "lib/hooks/useInstruktioner.test.tsx",
  "components/planering/InstruktionKort.render.test.tsx",
];

const M = [
  // ── sett per kommentar, ändrad text är osedd ──
  ["texten ignoreras: sedd = refen finns", "sett.get(i.ref) !== i.hash", "sett.get(i.ref) === undefined", LOGIK],
  ["hashen är densamma för alla texter", "innehallHash({ comment: text.trim() })", "innehallHash({ comment: '' })", LOGIK],
  ["Vidas text som ändrats räknas som sedd (ingen hash på Vidas rad)", "hash: hashText(vidaText), kalla: 'vida'", "hash: '', kalla: 'vida'", LOGIK],

  // ── texten på kortet ──
  ["två rader blir inte numrerade punkter", "if (rader.length > 1) return", "if (rader.length > 2) return", LOGIK],
  ["tomma rader räknas som punkter", ".map((r) => r.trim()).filter(Boolean)", ".map((r) => r.trim())", LOGIK],

  // ── var Vidas text finns ──
  ["traktdelens beskrivning blir Vidas instruktion", "(kort.kategori === 'hansyn' || kort.kategori === 'punkt') ? (kort.rader[0]?.text ?? '').trim() : ''", "(kort.rader[0]?.text ?? '').trim()", LOGIK],
  ["Vidas text sorteras sist", "return i.kalla === 'vida' ? 0", "return i.kalla === 'vida' ? 3", LOGIK],

  // ── inkörning ──
  ["ingen hysteres vid kanten", "d <= (tidigareInne ? INNE_M + UT_MARGINAL_M : INNE_M)", "d <= INNE_M", LOGIK],
  ["okänt avstånd räknas som inne", "if (d == null) return false;", "if (d == null) return true;", LOGIK],
  ["kön rensas inte när kommentaren lästs på annat håll", "const vantande = state.vantande.filter((n) => omraden.some((o) => o.nyckel === n && osedda(o, sett).length > 0));", "const vantande = [...state.vantande];", LOGIK],
  ["ingen inkörning om osedda saknas ignoreras", "if (ar && !var_ && osedda(o, sett).length > 0 && !vantande.includes(o.nyckel)) vantande.push(o.nyckel);", "if (ar && !var_ && !vantande.includes(o.nyckel)) vantande.push(o.nyckel);", LOGIK],
  ["larmet går inte först", "if (larmVisas) return null;", "", LOGIK],
  ["kortet visar även det som setts", "instruktioner: nya, fler:", "instruktioner: o.instruktioner, fler:", LOGIK],
  ["kortet försvinner när man kör ut", "const vantande = state.vantande.filter(", "const vantande = state.vantande.filter((n) => state.inne[n]).filter(", LOGIK],

  // ── genomgången ──
  ["Sett kvitterar andra områden än de valda", "if (!nycklar.includes(o.nyckel)) continue;", "", LOGIK],
  ["områden med nya ligger inte överst", "Number(b.o.nya > 0) - Number(a.o.nya > 0) || a.n - b.n", "a.n - b.n", LOGIK],
  ["antalet räknar bara de nya", "antal: lista.reduce((s, o) => s + o.instruktioner.length, 0)", "antal: lista.reduce((s, o) => s + o.nya, 0)", LOGIK],

  // ── lagring ──
  ["äldre enhetsversion vinner över nyare server", "(s.hash !== p.hash && p.tid > s.tid)", "(s.hash !== p.hash && p.tid < s.tid)", SETT],
  ["enheten skickar inte det servern saknar", "!server[ref] || (server[ref].hash", "(server[ref].hash", SETT],
  ["klienten skickar sin egen tid", "yta_nyckel: p.nyckel || null, innehall_hash: p.hash }", "yta_nyckel: p.nyckel || null, innehall_hash: p.hash, sett_at: new Date().toISOString() }", SETT],
  ["fel konfliktnyckel (en rad per förare saknas)", "{ onConflict: 'objekt_id,forare_id,kommentar_ref' }", "{ onConflict: 'objekt_id,kommentar_ref' }", SETT],
  ["servern sätter inte tiden", "new.sett_at := now();", "return new;", SQL],

  // ── hooken ──
  ["Sett kvitterar ingenting", "kvittera(kort.instruktioner.map((x) => ({ ref: x.ref, nyckel: kort.nyckel, hash: x.hash })));", "", HOOK],
  ["testläget skriver till databasen och enheten", "if (i.torr) return;   // testläget skriver varken i databasen eller på enheten", "", HOOK],
  ["enheten minns inte (tabellen saknas = inget minne)", "skrivLokaltSett(i.objektId, i.forare.id, nytt);", "", HOOK],
  ["inkörning räknas innan serverns sett är läst", "if (!aktiv || !laddad) return;\n    setState((prev)", "if (!aktiv) return;\n    setState((prev)", HOOK],
  ["hooken är aktiv utanför maskinläget", "if (!aktiv || !objektId || !forareId) { setSett({}); setLaddad(false); return; }", "if (!objektId || !forareId) { setSett({}); setLaddad(false); return; }", HOOK],
  ["sett läses för alla förare", ".eq('forare_id', forareId)", ".eq('forare_id', 'x')", "lib/instruktioner/sett.ts"],

  // ── kortet ──
  ["Sett-knappen är för liten", "export const INSTRUKTION_SETT_MIN_PX = 56;", "export const INSTRUKTION_SETT_MIN_PX = 40;", KORT],
  ["Vidas etikett är inte blå", "color: FARG.bla }}>Vida · traktdirektiv", "color: FARG.text3 }}>Vida · traktdirektiv", KORT],
  ["rubriken saknar \"instruktioner\"", "{kort.namn} – instruktioner</div>", "{kort.namn}</div>", KORT],
  ["kortet står under larmkortet (fel plats)", "zIndex: 620, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>\n      <style>{designCss}</style>\n      <div\n        role=\"status\"", "zIndex: 300, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>\n      <style>{designCss}</style>\n      <div\n        role=\"status\"", KORT],
  ["Sett alla visas även för ett område", "{medNya.length > 1 && <SettKnapp", "{medNya.length > 0 && <SettKnapp", KORT],
  ["raden på objektkortet visas utan instruktioner", "{p.instruktioner && p.instruktioner.antal > 0 && (\n            <RadKnapp forstaRad testid=\"kort-instruktioner\"", "{p.instruktioner && (\n            <RadKnapp forstaRad testid=\"kort-instruktioner\"", OBJ],

  // ── sidan ──
  ["instruktioner även utanför maskinläget", "const instruktionerAktiv = korvyActive && (maskinlage || !!maskinSomParam);", "const instruktionerAktiv = korvyActive;", SIDA],
  ["larmet får inte företräde", "larmVisas: !!larm.kort,", "larmVisas: false,", SIDA],
  ["testläget skriver", "    torr: !!testlage,\n  });\n  // Lästes kommentarerna", "    torr: false,\n  });\n  // Lästes kommentarerna", SIDA],
  ["kartkortet räknas inte som läst", "[traktInfo ? traktKortNyckel : markerMenuOpen != null ? markerNyckel(markerMenuOpen) : null,", "[null,", SIDA],
];

kor({
  filer: [LOGIK, SETT, HOOK, KORT, OBJ, SIDA, SQL],
  tester: TESTER,
  standardFil: LOGIK,
  mutationer: M,
});
