// Mutationskontroll för lastbilsflytt → förarens flyttrad (testnivå full, Martin 2026-10-19): varje del av "flyttloggen ger en rad hos
// den förare som hade maskinen, tid lastning → avlastning, ingen rad efter 17:00 / helg / röd dag / bekräftad dag, inom förarens pass,
// aldrig två gånger, aldrig igen efter svep, loggen före GPS" — tröskeln, dagsregeln, förarvalet, klippningen, gravstenen, flyttens id,
// ersättningen av GPS-raden, steget i synken och svepet i UI:t — ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
//
// Kör:  node scripts/mutationskontroll-flyttlogg.mjs               (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
//       node scripts/mutationskontroll-flyttlogg.mjs --bara-monster  (kontrollerar bara att varje mönster finns exakt en gång)
//       MUT_FILTER=<regex> node …                                  (kör bara mutanter vars namn matchar)
//       Avbryts den mitt i kan en mutant ligga kvar i källan: kontrollera med git diff innan du committar.
import { readFileSync } from "node:fs";
import { kor } from "./mutationsmotor.mjs";

const REGEL = "lib/flyttloggRad.ts";
const GPSREGEL = "lib/flyttRad.ts";
const SYNK = "lib/flyttloggSynk.ts";
const ROUTE = "app/api/mom-import/route.ts";
const UI = "components/arbetsrapport/Arbetsrapport.tsx";
const SVEP = "components/arbetsrapport/SvepRad.tsx";

const TESTER = [
  "lib/flyttloggRad.test.ts",
  "lib/flyttRad.test.ts",
  "app/api/mom-import/route.flyttlogg.test.ts",
  "components/arbetsrapport/Arbetsrapport.flyttlogg.render.test.tsx",
  "lib/lonesystem/flytt.lon.test.ts",
];

const M = [
  // ── regeln (lib/flyttloggRad.ts) ──
  ["ordinarie arbetstid slutar 18:00 (konstanten)", 'export const ORDINARIE_SLUT = "17:00";', 'export const ORDINARIE_SLUT = "18:00";', REGEL],
  ["ordinarie arbetstid slutar 18:00 (räkningen)", "const ORDINARIE_SLUT_SEK = 17 * 3600;", "const ORDINARIE_SLUT_SEK = 18 * 3600;", REGEL],
  ["en flytt som startar exakt 17:00 får en rad (> i stället för ≥)", "if (h.sek >= ORDINARIE_SLUT_SEK) continue;", "if (h.sek > ORDINARIE_SLUT_SEK) continue;", REGEL],
  ["avbrutna flyttar får rader", "if (f.avbruten || !f.maskin_id) continue;", "if (!f.maskin_id) continue;", REGEL],
  ["extern maskin (ingen maskin_id) får rader", "if (f.avbruten || !f.maskin_id) continue;", "if (f.avbruten) continue;", REGEL],
  ["helg och röda dagar kontrolleras inte", "if (!arOrdinarieDag(datum)) continue;", "", REGEL],
  ["lördag räknas som ordinarie dag", "if (veckodag === 0 || veckodag === 6) return false;", "if (veckodag === 0) return false;", REGEL],
  ["röda dagar räknas som ordinarie dagar", "return !getRödaDagar(d.getUTCFullYear())[datum];", "return true;", REGEL],
  ["lokal tid är fast +1 h (sommartiden glöms)", "const lokalMs = ms + sthlmOffsetMin(ms) * 60_000;", "const lokalMs = ms + 60 * 60_000;", REGEL],
  ["avlastning efter midnatt tappas", "const slutSek = s.datum === datum ? s.sek : 24 * 3600;", "const slutSek = s.sek;", REGEL],
  ["överlapp under en minut räcker för att hitta föraren", "if (ovl < 60) continue;", "if (ovl <= 0) continue;", REGEL],
  ["lika överlapp hos två förare ger rad ändå (den första vinner)", "if (!bast || lika || bast.dag.skyddad) continue;", "if (!bast || bast.dag.skyddad) continue;", REGEL],
  ["bekräftad dag får en rad", "if (!bast || lika || bast.dag.skyddad) continue;", "if (!bast || lika) continue;", REGEL],
  ["lika överlapp noteras inte (sista föraren vinner)", "else if (ovl === bast.ovl) lika = true;", "", REGEL],
  ["starten avrundas uppåt", "const sMin = Math.floor(Math.max(h.sek, tSek(dag.start_tid as string)) / 60);", "const sMin = Math.ceil(Math.max(h.sek, tSek(dag.start_tid as string)) / 60);", REGEL],
  ["raden klipps inte mot förarens slut", "Math.min(slutSek, tSek(dag.slut_tid as string))", "slutSek", REGEL],
  ["raden klipps inte mot förarens start", "Math.max(h.sek, tSek(dag.start_tid as string))", "h.sek", REGEL],
  ["gravstenen känns inte igen på flyttens id", "gravar.some(b => b.flytt_id === f.id || overlappar(", "gravar.some(b => overlappar(", REGEL],
  ["gravstenen känns inte igen på tiden (GPS-gravstenar)", "gravar.some(b => b.flytt_id === f.id || overlappar(sMin, eMin, { s: tMin(b.start_tid), e: tMin(b.slut_tid) }))", "gravar.some(b => b.flytt_id === f.id)", REGEL],
  ["en befintlig rad för samma flytt känns inte igen på flyttens id", "if (mina.some(u => u.flytt_id === f.id)) continue;", "", REGEL],
  ["förarens egna perioder får ersättas/ignoreras", 'if (krockar.some(u => u.kalla !== "flytt")) continue;', "", REGEL],
  ["GPS-raden ersätts inte", "const gps = krockar.map(u => u.id);", "const gps: string[] = [];", REGEL],
  ["platsnamn ignoreras", "(obj && i.namn.objekt[obj]) || (plats && i.namn.plats[plats]) || null", "(obj && i.namn.objekt[obj]) || null", REGEL],
  ["saknat km blir 0 km", "km != null && Number.isFinite(km) ? km : null", "km ?? 0", REGEL],
  ["raden märks som GPS-flytt", 'kalla: "flyttlogg", flytt_id: f.id,', 'kalla: "flytt", flytt_id: f.id,', REGEL],
  ["raden blir fakturerbar", 'aktivitet_typ: "flytt", debiterbar: false, objekt_id: null,\n        kommentar: flyttKommentar', 'aktivitet_typ: "flytt", debiterbar: true, objekt_id: null,\n        kommentar: flyttKommentar', REGEL],
  ["överlappande flyttar ger flera rader", "if (valda.some(v => v.rad.medarbetare_id === k.rad.medarbetare_id && v.rad.datum === k.rad.datum && overlappar(k.s, k.e, { s: v.s, e: v.e }))) continue;", "", REGEL],
  ["flyttarna sorteras inte i tidsordning", "kandidater.sort((a, b) => a.rad.datum.localeCompare(b.rad.datum) || a.s - b.s || a.e - b.e);", "kandidater.sort(() => 0);", REGEL],
  ["alla rader räknas som rader från flyttloggen", 'return rad?.kalla === "flyttlogg";', "return !!rad;", REGEL],
  ["GPS-raden får gravsten med flytt_id", 'return rad.kalla === "flyttlogg" ? { ...grund, flytt_id: rad.flytt_id ?? null } : grund;', "return { ...grund, flytt_id: rad.flytt_id ?? null };", GPSREGEL],
  ["flyttloggsraden får gravsten utan flytt_id", 'return rad.kalla === "flyttlogg" ? { ...grund, flytt_id: rad.flytt_id ?? null } : grund;', "return grund;", GPSREGEL],

  // ── limmet mot databasen (lib/flyttloggSynk.ts) ──
  ["gravstenar som inte går att läsa ignoreras", "if (bortaFel) {", "if (false) {", SYNK],
  ["segment som inte går att läsa ignoreras", "if (segFel) {", "if (false) {", SYNK],
  ["GPS-raden raderas inte före loggens rad", 'const { error: delFel } = await supabase.from("arbetsdag_segment").delete().in("id", plan.ersatt);', "const delFel: any = null;", SYNK],
  ["en annan synk som hann före (unikt per flytt) räknas som fel", 'if (error.code === "23P01" || error.code === "23505") continue;', 'if (error.code === "23P01") continue;', SYNK],
  ["trakternas namn hämtas inte (objekt)", 'await lasNamn("objekt", lista.flatMap(f => [f.fran_objekt_id, f.till_objekt_id]), namn.objekt);', "", SYNK],
  ["trakternas namn hämtas inte (platser)", 'await lasNamn("flyttplats", lista.flatMap(f => [f.fran_plats_id, f.till_plats_id]), namn.plats);', "", SYNK],

  // ── synksteget (route.ts) ──
  ["flyttloggssteget körs aldrig", "const logg = await skapaFlyttloggsRader(supabase, loggDagar);", "const logg = { skapade: 0 } as any;", ROUTE],
  ["bekräftade dagar märks inte som skyddade", "skyddad: skyddade.has(`${agg.medarbetare_id}_${agg.datum}`),", "skyddad: false,", ROUTE],
  ["flyttloggssteget får stoppa synken", "console.warn('flyttlogg: steget föll, synken fortsätter:', e?.message || e);", "throw e;", ROUTE],

  // ── UI (Arbetsrapport.tsx, SvepRad.tsx) ──
  ["en rad från flyttloggen går inte att svepa", "return arFlyttloggsRad(sg)\n                    ? <SvepRad", "return false\n                    ? <SvepRad", UI],
  ["borttagning via svep sker utan gravsten", "if (!(await skrivFlyttBorta(sg))) { setFlyttFel(RADERA_FEL); return; }", "await skrivFlyttBorta(sg);", UI],
  ["svepborttagning fast gravstenen föll (ingen varning)", "if (!(await skrivFlyttBorta(sg))) { setFlyttFel(RADERA_FEL); return; }", "if (!(await skrivFlyttBorta(sg))) { return; }", UI],
  ["raden visas inte som 'Från flyttloggen'", "{arFlyttloggsRad(sg) ? 'Från flyttloggen · ' : ''}räknas som arbetstid</p>", "{''}räknas som arbetstid</p>", UI],
  ["Redigera visar inte 'Från flyttloggen'", "{p.kalla==='flyttlogg' ? 'Från flyttloggen · ' : ''}räknas som arbetstid</span>", "{''}räknas som arbetstid</span>", UI],
  ["en ändrad tid på en flyttloggsrad ger gravsten", "if (periodForm.rad.kalla === 'flytt' && (ny5(", "if (arAutomatiskFlytt(periodForm.rad) && (ny5(", UI],
  ["Ta bort syns alltid", "{forskjutning < 0 && (", "{true && (", SVEP],
  ["svepet måste gå nästan hela vägen (tröskeln dubblas)", "const SVEP_TROSKEL = KNAPP_BREDD / 2;", "const SVEP_TROSKEL = KNAPP_BREDD * 2;", SVEP],
  ["svepet räknas redan vid 4 px", "const SVEP_TROSKEL = KNAPP_BREDD / 2;", "const SVEP_TROSKEL = KNAPP_BREDD / 20;", SVEP],
  ["scroll räknas som svep (riktningen är alltid sidled)", 'riktning.current = Math.abs(dx) > Math.abs(dy) ? "sidled" : "lodrat";', 'riktning.current = "sidled";', SVEP],
  ["ett click efter ett drag öppnar formuläret", "if (drogs.current) { drogs.current = false; return; }", "", SVEP],
  ["ett tryck på en öppnad rad öppnar formuläret i stället för att stänga", "if (oppen) setForskjutning(0); else onTryck();", "onTryck();", SVEP],
];

if (process.argv.includes("--bara-monster")) {
  const las = new Map();
  let fel = 0;
  for (const [namn, fran, , fil] of M) {
    if (!las.has(fil)) las.set(fil, readFileSync(fil, "utf8"));
    const n = las.get(fil).split(fran).length - 1;
    if (n !== 1) { console.error(`✗ "${namn}": mönstret finns ${n} gånger i ${fil}`); fel++; }
  }
  console.log(fel ? `${fel} mönster stämmer inte` : `Alla ${M.length} mönster finns exakt en gång.`);
  process.exit(fel ? 2 : 0);
}

const urval = process.env.MUT_FILTER ? M.filter(([namn]) => new RegExp(process.env.MUT_FILTER, "i").test(namn)) : M;
kor({ filer: [REGEL, GPSREGEL, SYNK, ROUTE, UI, SVEP], tester: TESTER, standardFil: REGEL, mutationer: urval });
