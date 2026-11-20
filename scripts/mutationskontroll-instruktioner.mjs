// Mutationskontroll för "Instruktioner till föraren" (maskinläget): varje regel — sett per kommentar och hash, larm först, inkörning med hysteres, Vidas text bara på
// hänsynsytor och avlägg, ett Sett, testläget skriver inget, bara maskinläget — ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
//
// Täcker också: bara platser (inga punktsymboler/linjer), ordningen lossning > larm > instruktion > avläggsrad och testlägets håll-fingret.
//
// Kör:  node scripts/mutationskontroll-instruktioner.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
import { kor } from "./mutationsmotor.mjs";

const LOGIK = "lib/instruktioner/instruktioner.ts";
const SETT = "lib/instruktioner/sett.ts";
const HOOK = "lib/hooks/useInstruktioner.ts";
const KORT = "components/planering/InstruktionKort.tsx";
const OBJ = "components/planering/ObjektKort.tsx";
const SIDA = "app/planering/page.tsx";
const SQL = "supabase/migrations/20261024102940_kommentar_sett_forare.sql";
const ORD = "lib/instruktioner/ordning.ts";
const TESTPOS = "lib/testPosition.ts";

const TESTER = [
  "lib/instruktioner/instruktioner.test.ts",
  "lib/instruktioner/sett.test.ts",
  "lib/instruktioner/instruktioner.vakter.test.ts",
  "lib/hooks/useInstruktioner.test.tsx",
  "components/planering/InstruktionKort.render.test.tsx",
  "lib/instruktioner/ordning.test.ts",
  "components/planering/Instruktion.ordning.render.test.tsx",
  "lib/testPosition.test.ts",
];

const M = [
  // ── sett per kommentar, ändrad text är osedd ──
  ["texten ignoreras: sedd = refen finns", "sett.get(i.ref) !== i.hash", "sett.get(i.ref) === undefined", LOGIK],
  ["hashen är densamma för alla texter", "innehallHash({ comment: text.trim() })", "innehallHash({ comment: '' })", LOGIK],
  ["Vidas text som ändrats räknas som sedd (ingen hash på Vidas rad)", "hash: hashText(vidaText), kalla: 'vida'", "hash: '', kalla: 'vida'", LOGIK],

  // ── texten på kortet ──
  ["flera rader blir inte numrerade punkter", "if (arNumrerad(rader)) return", "if (false) return", LOGIK],
  ["instruktionerna delar text på egen hand i stället för kartkortets regel", "const rader = kommentarPunkter(text);", "const rader = text.split('\\n');", LOGIK],

  // ── var Vidas text finns ──
  ["ytans eget namn jämförs inte mot ATGARD", "arInstruktionsText(kort.vidaKommentar, [props.FLBESKR, kort.rubrik])", "arInstruktionsText(kort.vidaKommentar, [])", LOGIK],
  ["Vidas text sorteras sist", "return i.kalla === 'vida' ? 0", "return i.kalla === 'vida' ? 3", LOGIK],

  // ── inkörning ──
  ["ingen hysteres vid kanten", "d <= (tidigareInne ? INNE_M + UT_MARGINAL_M : INNE_M)", "d <= INNE_M", LOGIK],
  ["okänt avstånd räknas som inne", "if (d == null) return false;", "if (d == null) return true;", LOGIK],
  ["kön rensas inte när kommentaren lästs på annat håll", "const vantande = state.vantande.filter((n) => omraden.some((o) => o.nyckel === n && osedda(o, sett).length > 0));", "const vantande = [...state.vantande];", LOGIK],
  ["ingen inkörning om osedda saknas ignoreras", "if (ar && !var_ && osedda(o, sett).length > 0 && !vantande.includes(o.nyckel)) vantande.push(o.nyckel);", "if (ar && !var_ && !vantande.includes(o.nyckel)) vantande.push(o.nyckel);", LOGIK],
  ["ett annat kort (larm/lossning) blockerar inte instruktionen", "if (blockerad) return null;", "", LOGIK],
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
    ["testläget skriver", "    torr: !!testlage,\n  });\n  // Lästes kommentarerna", "    torr: false,\n  });\n  // Lästes kommentarerna", SIDA],
  ["kartkortet räknas inte som läst", "[traktInfo ? traktKortNyckel : markerMenuOpen != null ? markerNyckel(markerMenuOpen) : null,", "[null,", SIDA],

  // ── bara platser man kör in i ──
  ["punktsymboler (Evighetsträd) blir instruktionsområden", "geomTyp === 'Polygon' || geomTyp === 'MultiPolygon' || ((geomTyp === 'Point' || geomTyp === 'MultiPoint') && arAvlagg)", "geomTyp === 'Polygon' || geomTyp === 'MultiPolygon' || geomTyp === 'Point' || geomTyp === 'MultiPoint'", LOGIK],
  ["Vidas linjer släpps in", "geomTyp === 'Polygon' || geomTyp === 'MultiPolygon' || ((", "geomTyp === 'LineString' || geomTyp === 'Polygon' || geomTyp === 'MultiPolygon' || ((", LOGIK],
  ["alla egna punktsymboler räknas, inte bara avlägg", "m.isMarker && m.type === EGET_AVLAGG_TYP && typeof m.x", "m.isMarker && typeof m.x", LOGIK],
  ["egna avlägg räknas inte", "export const EGET_AVLAGG_TYP = 'landing';", "export const EGET_AVLAGG_TYP = 'ingen';", LOGIK],

  // ── ett kort åt gången ──
  ["lossningskortet blockerar inte instruktionen", "a.larmVisas || a.lossningVisas", "a.larmVisas", ORD],
  ["larm blockerar inte instruktionen", "a.larmVisas || a.lossningVisas", "a.lossningVisas", ORD],
  ["avläggsraden väntar inte på instruktionen", "a.ledigtUtanInstruktion && !a.instruktionVantar", "a.ledigtUtanInstruktion", ORD],
  ["avläggsraden väntar bara medan instruktionskortet syns (inte när den väntar på larm/lossning)", "const vantar = useMemo(() => (aktiv ? kortAttVisa(state, omraden, karta, false) != null : false), [aktiv, state, omraden, karta]);", "const vantar = useMemo(() => (aktiv ? kortAttVisa(state, omraden, karta, inp.blockerad) != null : false), [aktiv, state, omraden, karta, inp.blockerad]);", HOOK],
  ["sidan räknar inte Ändra-arket som lossning", "!!skotarLass.kort || !!skotarLass.andra || !!skotarLass.nyttAvlagg ||", "!!skotarLass.kort || !!skotarLass.nyttAvlagg ||", SIDA],
  ["sidan skickar inte lossning till instruktionen", "}), lossningVisas }),", "}), lossningVisas: false }),", SIDA],
  ["en Fara kan skymmas av instruktionen", "a.harKort && (a.vantarPaSett || a.arFara)", "a.harKort && a.vantarPaSett", ORD],
  ["ett sett larm som står kvar blockerar instruktionen för alltid (hänsynsytan)", "a.harKort && (a.vantarPaSett || a.arFara)", "a.harKort", ORD],
  ["larmkortet göms inte när instruktionen visas (två kort samtidigt)", "{korvyActive && larm.kort && !inst.kort && (", "{korvyActive && larm.kort && (", SIDA],
  ["avläggsraden får visas medan instruktionen väntar", "instruktionVantar: inst.vantar })}", "instruktionVantar: false })}", SIDA],

  // ── testlägets håll-fingret ──
  ["håll-fingret flyttar direkt (ingen väntetid)", "      vidPosition(ll.lat, ll.lng);\n    }, ms);", "      vidPosition(ll.lat, ll.lng);\n    }, 0);", TESTPOS],
  ["klicket efter långtrycket sväljs inte", "const klick = (e: MouseEvent) => { if (nu() < slukTill) {", "const klick = (e: MouseEvent) => { if (false) {", TESTPOS],
  ["drag avbryter inte långtrycket", "if (timer && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > rorelsePx) stopp();", "", TESTPOS],
  ["nyp avbryter inte långtrycket", "if (nere.size > 1) return;   // nyp = zoom", "", TESTPOS],
  ["håll-fingret kopplas utanför testläget", "if (!map || !mapLibreReady || !testlage) return;\n    return kopplaLangtryckFlytt", "if (!map || !mapLibreReady) return;\n    return kopplaLangtryckFlytt", SIDA],
  ["plusdockans långtryck öppnas också i testläget", "  if (testlage) langtryckTillatenRef.current = false;", "", SIDA],
  // ── Vidas text: bara på ytor, bara om den säger något; avlägg = namn ──
  ["Vidas ATGARD på ett avlägg triggar instruktionskortet", "const vidaText = !arAvlagg && arInstruktionsText(", "const vidaText = arInstruktionsText(", LOGIK],
  ["ett bara typnamn (\"hänsynsyta\") räknas som instruktion", "if (TYPNAMN.has(t)) return false;", "", LOGIK],
  ["en text som bara upprepar ytans namn räknas som instruktion", "return !namn.some((n) => !!n && jamfor(n) === t);", "return true;", LOGIK],
  ["en tom text räknas som instruktion", "if (!t) return false;", "", LOGIK],
  ["avläggen märks inte som avlägg", "avlagg: arAvlagg, instruktioner: sorteraInstruktioner(lista)", "avlagg: false, instruktioner: sorteraInstruktioner(lista)", LOGIK],
  ["kortet säger inte \"Du är vid avlägget\"", "{kort.avlagg ? 'Du är vid avlägget' : 'Du kör in i området nu'}", "{'Du kör in i området nu'}", KORT],
  ["Vidas ATGARD på avlägg visas inte som namn i avläggets kort", "namn={traktInfo.kategori === 'punkt' && traktInfo.vidaKommentar ? `${rubrikVisad} · Vida: ${traktInfo.vidaKommentar}` : rubrikVisad}", "namn={rubrikVisad}", SIDA],
  ["Vidas ATGARD på avlägg visas också som kommentar i avläggets kort", "vidaKommentar={traktInfo.kategori === 'punkt' ? undefined : traktInfo.vidaKommentar}", "vidaKommentar={traktInfo.vidaKommentar}", SIDA],
  ["skördaren saknar ⓘ", "{objektListaVal || skotarKorvy || instruktionerAktiv ? (", "{objektListaVal || skotarKorvy ? (", SIDA],
];

kor({
  filer: [LOGIK, SETT, HOOK, KORT, OBJ, SIDA, SQL, ORD, TESTPOS],
  tester: TESTER,
  standardFil: LOGIK,
  mutationer: M,
});
