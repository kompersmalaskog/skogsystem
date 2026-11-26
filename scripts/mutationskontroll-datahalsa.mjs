// Mutationskontroll för Datahälsa — "bara det som är fel just nu".
// Varje regel i läkt-regeln (lib/datahalsa/lakt.ts) och i sammanställningen (lib/datahalsa/felNu.ts)
// ska bli RÖD när EN sak ändras. Motorn: scripts/mutationsmotor.mjs.
//
// Täcker: vad som läker (senare fil, samma serie, utan egna fel, omkörd fil), vad som INTE läker
// (filens egen rad, annan maskin, annan filtyp, fil med status FEL), fönstren (7 dygn, 24 timmar),
// att ofarliga fel aldrig räknas, och att ett läsfel aldrig blir "Allt fungerar".
//
// Kör:  node scripts/mutationskontroll-datahalsa.mjs   (EN tung körning åt gången)
import { kor } from "./mutationsmotor.mjs";

const LAKT = "lib/datahalsa/lakt.ts";
const NU = "lib/datahalsa/felNu.ts";

const TESTER = [
  "lib/datahalsa/lakt.test.ts",
  "lib/datahalsa/felNu.test.ts",
  "app/datahalsa/page.render.test.tsx",
];

const M = [
  // ── läkt (1): nästa fil i samma serie ──
  ["en fil FÖRE felet läker", "x.f.filnamn !== felFil.filnamn && x.tid > efter", "x.f.filnamn !== felFil.filnamn && x.tid > 0"],
  ["vilken senare fil som helst läker (serien kollas inte)", "      && sammaSerie(felFil.serie!, felFil.maskinId, x.serie, (x.f.maskinId ?? '').trim() || null))", "      && true)"],
  ["en fil som själv felade läker", ".filter((f) => f.status === 'OK' && (!perFil.has(f.filnamn) || perFil.get(f.filnamn)!.lakt?.hur === 'omkord'))", ".filter((f) => f.status === 'OK')"],
  // INTE MED (jämngod, dubbelt skydd): att ta bort `f.status === 'OK'` ur filtret för friska filer ändrar ingenting — en fil som inte
  // är OK är alltid en felande fil (perFil) och faller redan på det andra villkoret. Testet "en senare fil med status FEL läker inte" håller regeln.
  ["en omkörd fil läker inte de äldre i sin serie", ".filter((f) => f.status === 'OK' && (!perFil.has(f.filnamn) || perFil.get(f.filnamn)!.lakt?.hur === 'omkord'))", ".filter((f) => f.status === 'OK' && !perFil.has(f.filnamn))"],
  ["annan filtyp räknas som samma serie", "if (a.typ !== b.typ || a.stam !== b.stam) return false", "if (a.stam !== b.stam) return false"],
  ["annat objekt räknas som samma serie", "if (a.typ !== b.typ || a.stam !== b.stam) return false", "if (a.typ !== b.typ) return false"],
  ["annan maskin räknas som samma serie", "  return ma === mb\n}", "  return true\n}"],
  ["okänd maskin på filen som felade hindrar läkningen", "if (!ma || !mb) return true", "if (!ma || !mb) return false"],
  ["Ponsse HQC utan objektnamn läks av vilken maskin som helst", "if (!a.stam) return !!ma && ma === mb", "if (!a.stam) return true"],

  // ── läkt (2): omkörd ──
  ["filens egen rad i filloggen räknas som omkörning", "ms(rad.importeradTid) - ms(felFil.sistaFel) > OMKORD_MIN * 60_000", "ms(rad.importeradTid) - ms(felFil.sistaFel) > 0"],
  ["gränsen för omkörning räknas med >=", "ms(rad.importeradTid) - ms(felFil.sistaFel) > OMKORD_MIN * 60_000", "ms(rad.importeradTid) - ms(felFil.sistaFel) >= OMKORD_MIN * 60_000"],
  ["omkörd med status FEL räknas som läkt", "if (rad && rad.status === 'OK' && ms(rad.importeradTid)", "if (rad && ms(rad.importeradTid)"],
  ["omkörning finns inte", "      felFil.lakt = { filnamn: rad.filnamn, tid: rad.importeradTid, hur: 'omkord' }", "      void rad"],
  ["första felet räknas i stället för det sista", "if (ms(tid) > ms(f.sistaFel)) f.sistaFel = tid", "if (ms(tid) < ms(f.sistaFel)) f.sistaFel = tid"],

  // ── fönstren ──
  ["ett oläkt fel är aldrig gammalt", "const arNu = (f: FelFil) => ms(f.sistaFel) >= nu - (f.filnamn ? FEL_NU_DYGN * 24 : UTAN_FIL_TIM) * 3_600_000", "const arNu = (f: FelFil) => true || ms(f.sistaFel) >= nu - (f.filnamn ? FEL_NU_DYGN * 24 : UTAN_FIL_TIM) * 3_600_000"],
  ["ett fel utan filnamn räknas i sju dygn", "(f.filnamn ? FEL_NU_DYGN * 24 : UTAN_FIL_TIM)", "(FEL_NU_DYGN * 24)"],
  ["sju dygn blir ett", "export const FEL_NU_DYGN = 7", "export const FEL_NU_DYGN = 1"],
  ["läkta fel står kvar som fel nu", "nu: alla.filter((f) => !f.lakt && arNu(f)).sort(nyastForst),", "nu: alla.filter((f) => arNu(f)).sort(nyastForst),"],

  // ── vad som är ett fel ──
  ["avvisade dubbletter räknas som fel", "if (kod === '409') return 'ofarligt'", "if (kod === '409x') return 'ofarligt'"],
  ["väderanteckningen räknas som fel", "if (kod.startsWith('vader')) return 'ofarligt'", ""],
  ["ofarliga rader blir felande filer", "if (importFelKlass(r) === 'akta') lagg(r.filnamn, r.tid, r.tabell, kortOrsak(r.feltext))", "lagg(r.filnamn, r.tid, r.tabell, kortOrsak(r.feltext))"],
  ["en fil med status FEL i filloggen räknas inte", "if (f.status !== 'OK' && !perFil.has(f.filnamn)) lagg(f.filnamn, f.importeradTid, null, kortOrsak(f.felmeddelande))", ""],
  ["fel i import_fel och FEL i filloggen blir två filer", "if (f.status !== 'OK' && !perFil.has(f.filnamn)) lagg(", "if (f.status !== 'OK') lagg("],

  // ── serien ur filnamnet ──
  ["Rottne-filer går inte att läsa", "if (r && normStam(r[1])) return { typ, stam: normStam(r[1]), namn: renNamn(r[1]), maskin: null }", ""],
  ["skotarens filer går inte att läsa", "if (k && normStam(k[1])) return { typ, stam: normStam(k[1]), namn: renNamn(k[1]), maskin: null }", ""],
  ["filtypen läses inte ur namnet", "const typ = namn.slice(punkt + 1).toLowerCase()", "const typ = 'fil'"],

  // ── sammanställningen: fel nu ──
  ["ett läsfel på importfelen tystas", "    lasfel('importfel', 'importfel', 'om något tappades vid import')", "    void 0", NU],
  ["ett läsfel på statusraderna tystas", "    lasfel('status', 'filer', 'importen och kontrollerna på importdatorn')", "    void 0", NU],
  ["ett läsfel på invarianterna tystas", "    lasfel('invarianter', 'invarianter', 'maskintiden')", "    void 0", NU],
  ["ett läsfel på koordinaterna tystas", "    lasfel('koordinat', 'koordinat', 'objektens koordinater')", "    void 0", NU],
  ["ett läsfel på lassen tystas", "    lasfel('lass', 'skotarlass', 'skotarens lass')", "    void 0", NU],
  ["ett läsfel på leveransen tystas", "if (d.leverans.fel) lasfel('leverans', 'leverans', 'maskinernas leverans')", "", NU],
  ["bara läsfel blir Allt fungerar", "if (problem.every((p) => p.lasfel)) return { niva: 'okant', rubrik: 'Kunde inte kontrollera allt', punkter }", "if (problem.every((p) => p.lasfel)) return { niva: 'gron', rubrik: 'Allt fungerar', punkter: [] }", NU],
  ["oläkta importfel blir inga problem", "for (const s of importfel.nuSerier) {", "for (const s of [] as typeof importfel.nuSerier) {", NU],
  ["läkta importfel blir problem", "for (const s of importfel.nuSerier) {", "for (const s of importfel.laktaSerier) {", NU],
  ["en kontroll som larmar blir inget problem", "      if (k.lage === 'larm') {", "      if (k.lage === 'larmx') {", NU],
  ["en kontroll som inte gick att köra blir inget problem", "      } else if (k.lage === 'okand') {", "      } else if (k.lage === 'okandx') {", NU],
  ["kontroller som stått still är inget problem", "if (kontroller.length === 0 || !korda || d.nu - Date.parse(korda) > KONTROLLER_GAMLA_TIM * 3_600_000) {", "if (kontroller.length === 0 || !korda) {", NU],
  ["importen som inte kontrolleras är inget problem", "    } else if (vy.lage !== 'ok') {", "    } else if (vy.lage === 'okand') {", NU],
  ["importens larm blir inget problem", "    if (vy.lage === 'larm') {", "    if (vy.lage === 'larmx') {", NU],
  ["raden om när larmet startade räknas som ett eget problem", "const rader = vy.rader.filter((r) => !/^Larmet startade\\b/i.test(r))", "const rader = vy.rader", NU],
  ["obekräftade lass är inget problem", "  } else if (d.lass.data.antal > 0) {", "  } else if (d.lass.data.antal > 99999) {", NU],
  ["noll lass är ett problem", "  } else if (d.lass.data.antal > 0) {", "  } else if (d.lass.data.antal >= 0) {", NU],
  ["dagar över 24 timmar är inget problem", "if (i.over24h > 0) problem.push(", "if (i.over24h > 99999) problem.push(", NU],
  ["arbetsdagar utan koordinat är inget problem", "if (k.koordlosa > 0) problem.push(", "if (k.koordlosa > 99999) problem.push(", NU],
  ["ett problem heter flera", "rubrik: problem.length === 1 ? '1 sak är fel' : `${problem.length} saker är fel`", "rubrik: `${problem.length} saker är fel`", NU],
];

// Vitest startas med node direkt (inte via npx): npx går inte att starta utan skal på Windows, och då ser grunden röd ut.
kor({
  filer: [LAKT, NU], tester: TESTER, standardFil: LAKT, mutationer: M,
  kommando: [process.execPath, "node_modules/vitest/vitest.mjs", "run", ...TESTER, "--reporter=dot"],
});
