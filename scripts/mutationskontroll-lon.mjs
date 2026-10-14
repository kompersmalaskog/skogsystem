// Mutationskontroll för lönefixarna 2026-10-14: (1) paginering av årsövertiden, (3) dygnsvilan för pass över midnatt, (4) veckovilans ändar.
// Testnivå full (lag och lön). Motorn: scripts/mutationsmotor.mjs (ändrar EN sak i taget, kör testerna, kräver rött; återställer filerna).
//
// Kör:  node scripts/mutationskontroll-lon.mjs               (EN tung körning åt gången: kör inte tillsammans med tsc/build)
import { kor } from "./mutationsmotor.mjs";

const ALLA = "lib/lonesystem/allaRader.ts";
const ROUTE = "app/api/lon/arsovertid/route.ts";
const VILA = "lib/vilobrott.ts";
const STORAGE = "lib/vilobrott-storage.ts";
const STHLM = "lib/sthlmTid.ts";

const M = [
  // ── 1. Paginering (lib/lonesystem/allaRader.ts och routen) ──
  ["paginering: sidstorlek 500 (fler anrop än testet väntar)", "export const SIDSTORLEK = 1000;", "export const SIDSTORLEK = 500;", ALLA],
  ["paginering: sidstorlek 2000 (PostgREST ger ändå 1000 → rader tappas)", "export const SIDSTORLEK = 1000;", "export const SIDSTORLEK = 2000;", ALLA],
  ["paginering: stannar efter första sidan", "if (!r.data || r.data.length < SIDSTORLEK) break;", "break;", ALLA],
  ["paginering: ordnar inte på id", 'bygg().order("id", { ascending: true }).range(', "bygg().range(", ALLA],
  ["paginering: läsfel ignoreras", "if (r.error) throw r.error;", "", ALLA],
  ["paginering: hoppar över en rad mellan sidorna", "fran += SIDSTORLEK)", "fran += SIDSTORLEK + 1)", ALLA],
  ["paginering: tappar sista sidan när den är exakt full", "if (!r.data || r.data.length < SIDSTORLEK) break;", "if (!r.data || r.data.length <= SIDSTORLEK) break;", ALLA],
  ["årsövertiden läser arbetsdag utan paginering",
    'allaRader<any>(() => supabase.from("arbetsdag").select("medarbetare_id, datum, arbetad_min, dagtyp, start_tid").gte("datum", `${ar}-01-01`).lte("datum", tomDatum)),',
    'supabase.from("arbetsdag").select("medarbetare_id, datum, arbetad_min, dagtyp, start_tid").gte("datum", `${ar}-01-01`).lte("datum", tomDatum).then((r: any) => { if (r.error) throw r.error; return r.data || []; }),', ROUTE],
  ["årsövertiden läser extra_tid utan paginering",
    'allaRader<any>(() => supabase.from("extra_tid").select("medarbetare_id, datum, minuter").gte("datum", `${ar}-01-01`).lte("datum", tomDatum)),',
    'supabase.from("extra_tid").select("medarbetare_id, datum, minuter").gte("datum", `${ar}-01-01`).lte("datum", tomDatum).then((r: any) => { if (r.error) throw r.error; return r.data || []; }),', ROUTE],

  // ── 3. Dygnsvila för pass över midnatt (lib/vilobrott.ts) ──
  ["midnatt: pass över midnatt slutar samma dygn", "if (start1 && slut1.h * 60 + slut1.m <= start1.h * 60 + start1.m) d1 = new Date(d1.getTime() + 86400000);", "", VILA],
  ["midnatt: slut = start räknas inte som 24 tim (<= → <)", "slut1.h * 60 + slut1.m <= start1.h * 60 + start1.m", "slut1.h * 60 + slut1.m < start1.h * 60 + start1.m", VILA],
  ["midnatt: rollover två dygn", "d1 = new Date(d1.getTime() + 86400000);   // pass över midnatt", "d1 = new Date(d1.getTime() + 2 * 86400000);   // pass över midnatt", VILA],
  ["midnatt: beskrivningen visar passets startdatum som slutdatum", "formatDatumKort(datumStr(d1))", "formatDatumKort(dag1.datum)", VILA],

  // ── 4. Veckovilans ändar ──
  ["ändar: ingen vila före första passet", "if (forstaStart > wsT) maxMs = forstaStart - wsT;", "if (false) maxMs = forstaStart - wsT;", VILA],
  ["ändar: ledande vila räknas från fel håll", "if (forstaStart > wsT) maxMs = forstaStart - wsT;", "if (forstaStart > wsT) maxMs = wsT - forstaStart;", VILA],
  ["ändar: ingen vila efter sista passet", "if (nuT > cursor && nuT > wsT && cursor < weT && nuT - cursor > maxMs) maxMs = nuT - cursor;", "if (false) maxMs = nuT - cursor;", VILA],
  ["ändar: avslutande vila räknas även när den inte överlappar fönstret", "if (nuT > cursor && nuT > wsT && cursor < weT && nuT - cursor > maxMs)", "if (nuT > cursor && nuT - cursor > maxMs)", VILA],
  ["ändar: avslutande vila bara om `nu` är satt → alltid av", "  if (nu) {                                                                  // efter sista passet, fram till nu", "  if (false) {                                                                  // efter sista passet, fram till nu", VILA],
  ["ändar: inget riktigt 'nu' som standard", "let till = nu === null ? undefined : (nu ?? sthlmVaggklocka(new Date()));", "let till = nu === null ? undefined : nu;", VILA],
  ["ändar: null betyder riktiga nu i stället för ingen avslutande vila", "let till = nu === null ? undefined : (nu ?? sthlmVaggklocka(new Date()));", "let till = nu ?? sthlmVaggklocka(new Date());", VILA],
  ["ändar: pågående pass kapar inte luckan", "if (start.getTime() >= sistaSlut && start.getTime() < till.getTime()) till = start;", "if (false) till = start;", VILA],
  ["ändar: en gammal pågående rad kapar (före sista passets slut)", "start.getTime() >= sistaSlut && start.getTime() < till.getTime()", "start.getTime() >= 0 && start.getTime() < till.getTime()", VILA],
  ["ändar: ett pågående pass efter `nu` förlänger vilan", "start.getTime() >= sistaSlut && start.getTime() < till.getTime()", "start.getTime() >= sistaSlut", VILA],
  ["ändar: veckovilaPerDag får inget nu (veckovilaPerDag ignorerar underlagetTill)", "return dagligVeckovila(sorterad, fonsterDagar, underlagetTill(arbetsdagar, arbetsIntervaller(sorterad), nu));", "return dagligVeckovila(sorterad, fonsterDagar, undefined);", VILA],
  ["ändar: analyseraVilobrott får inget nu", "underlagetTill(arbetsdagar, arbetsIntervaller(sorterad), nu));\n  if (dagliga.length === 0) return brott;", "undefined);\n  if (dagliga.length === 0) return brott;", VILA],

  // ── 4. Omanalysen vet bara så långt som den läst (lib/vilobrott-storage.ts) ──
  ["omanalys: alltid riktiga nu (vilan efter fönstrets slut räknas)", "nuSthlm && fonsterToDatum >= ymdLokal(nuSthlm) ? nuSthlm : new Date(`${fonsterToDatum}T23:59:59`)", "nuSthlm ?? new Date(`${fonsterToDatum}T23:59:59`)", STORAGE],
  ["omanalys: fönstrets slut = början av dagen (för lite vila)", "new Date(`${fonsterToDatum}T23:59:59`)", "new Date(`${fonsterToDatum}T00:00:00`)", STORAGE],
  ["omanalys: fönster som slutar i dag räknas till dagens slut i stället för nu", "fonsterToDatum >= ymdLokal(nuSthlm)", "fonsterToDatum > ymdLokal(nuSthlm)", STORAGE],
  ["omanalys: skickar inget nu alls (riktiga nu för alla fönster)", "trosklar, underlagTill);", "trosklar);", STORAGE],

  // ── Stockholmstid (lib/sthlmTid.ts) ──
  ["stockholmstid: UTC i stället för Stockholm", 'timeZone: "Europe/Stockholm", year', 'timeZone: "UTC", year', STHLM],
  ["stockholmstid: månaden räknas utan -1", "new Date(p.ar, p.man - 1, p.dag, p.h, p.mi)", "new Date(p.ar, p.man, p.dag, p.h, p.mi)", STHLM],
  ["stockholmstid: minuterna tappas", "new Date(p.ar, p.man - 1, p.dag, p.h, p.mi)", "new Date(p.ar, p.man - 1, p.dag, p.h, 0)", STHLM],
];

kor({
  filer: [ALLA, ROUTE, VILA, STORAGE, STHLM],
  tester: ["lib/vilobrott.test.ts", "lib/vilobrott-storage.test.ts", "lib/admin/vilobrottLista.test.ts", "lib/lonesystem/allaRader.test.ts", "app/api/lon/arsovertid/route.test.ts", "lib/arbetstidsgranser.test.ts"],
  standardFil: VILA,
  mutationer: M,
});
