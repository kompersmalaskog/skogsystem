// Mutationskontroll för maskinflytt som egen rad (testnivå full, Martin 2026-10-19): varje del av "flytt = en egen rad i dagen, bara
// ≥ 30 min och ≥ 2 km, inom förarens pass, aldrig på bekräftade dagar, aldrig två gånger, aldrig igen efter borttagning, flyttiden är
// redan betald" — tröskeln, klippningen mot passet, avrundningen, överlappsskyddet, gravstenen, förfiltret, kalla/debiterbar, dagens
// och kvällens rad, ändra/ta bort — ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
// Reglerna: lib/flyttRad.ts, lib/flyttSynk.ts, app/api/mom-import/route.ts (steg 7d), components/arbetsrapport/Arbetsrapport.tsx.
//
// Kör:  node scripts/mutationskontroll-flytt.mjs               (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
//       node scripts/mutationskontroll-flytt.mjs --bara-monster  (kontrollerar bara att varje mönster finns exakt en gång)
//       Avbryts den mitt i kan en mutant ligga kvar i källan: kontrollera med git diff innan du committar.
import { readFileSync } from "node:fs";
import { kor } from "./mutationsmotor.mjs";

const REGEL = "lib/flyttRad.ts";
const SYNK = "lib/flyttSynk.ts";
const ROUTE = "app/api/mom-import/route.ts";
const UI = "components/arbetsrapport/Arbetsrapport.tsx";

const TESTER = [
  "lib/flyttRad.test.ts",
  "app/api/mom-import/route.flytt.test.ts",
  "components/arbetsrapport/Arbetsrapport.flytt.render.test.tsx",
  "lib/lonesystem/flytt.lon.test.ts",
];

const M = [
  // ── regeln (lib/flyttRad.ts) ──
  ["minsta tid sänks till 29 min", "export const FLYTT_MIN_MIN = 30;", "export const FLYTT_MIN_MIN = 29;", REGEL],
  ["minsta sträcka sänks till 1 km", "export const FLYTT_MIN_KM = 2;", "export const FLYTT_MIN_KM = 1;", REGEL],
  ["tidsgränsen är exklusiv (> i stället för ≥)", "return minuter >= FLYTT_MIN_MIN && km >= FLYTT_MIN_KM;", "return minuter > FLYTT_MIN_MIN && km >= FLYTT_MIN_KM;", REGEL],
  ["sträckegränsen är exklusiv (> i stället för ≥)", "return minuter >= FLYTT_MIN_MIN && km >= FLYTT_MIN_KM;", "return minuter >= FLYTT_MIN_MIN && km > FLYTT_MIN_KM;", REGEL],
  ["tid ELLER sträcka räcker", "return minuter >= FLYTT_MIN_MIN && km >= FLYTT_MIN_KM;", "return minuter >= FLYTT_MIN_MIN || km >= FLYTT_MIN_KM;", REGEL],
  ["jordradien i meter (avstånden blir tusen gånger för stora)", "const R = 6371, rad = Math.PI / 180;", "const R = 6371000, rad = Math.PI / 180;", REGEL],
  ["dag utan pass får också flyttrader", "if (!dag.start_tid || !dag.slut_tid) return [];", "if (false) return [];", REGEL],
  ["luckor över natten räknas (datumen kontrolleras inte)", "if (!a || !b || a.datum !== dag.datum || b.datum !== dag.datum) continue;", "if (!a || !b) continue;", REGEL],
  ["luckan klipps inte mot förarens pass", "const s = Math.max(a.sek, passS), e = Math.min(b.sek, passE);", "const s = a.sek, e = b.sek;", REGEL],
  ["regeln räknar den oklippta luckan (30 min före klippning)", "if (!arFlytt((e - s) / 60, km)) continue;", "if (!arFlytt((b.sek - a.sek) / 60, km)) continue;", REGEL],
  ["starten avrundas uppåt (raden kan bli kortare än 30 min)", "const sMin = Math.floor(s / 60), eMin = Math.floor(e / 60);", "const sMin = Math.ceil(s / 60), eMin = Math.floor(e / 60);", REGEL],
  ["slutet avrundas uppåt (raden kan sluta efter passet)", "const sMin = Math.floor(s / 60), eMin = Math.floor(e / 60);", "const sMin = Math.floor(s / 60), eMin = Math.ceil(e / 60);", REGEL],
  ["flyttarna sorteras inte i tidsordning", "kandidater.sort((x, y) => x.s - y.s || x.e - y.e);", "kandidater.sort(() => 0);", REGEL],
  ["borttagna flyttar (gravstenar) ignoreras", "const spärrar = [...i.upptagna, ...i.borta].map(", "const spärrar = [...i.upptagna].map(", REGEL],
  ["befintliga rader ignoreras (dubbletter)", "const spärrar = [...i.upptagna, ...i.borta].map(", "const spärrar = [...i.borta].map(", REGEL],
  ["tangerande perioder räknas som överlapp", "const overlappar = (s: number, e: number, b: { s: number; e: number }) => s < b.e && b.s < e;", "const overlappar = (s: number, e: number, b: { s: number; e: number }) => s <= b.e && b.s <= e;", REGEL],
  ["bara en av ändarna behöver överlappa", "const overlappar = (s: number, e: number, b: { s: number; e: number }) => s < b.e && b.s < e;", "const overlappar = (s: number, e: number, b: { s: number; e: number }) => s < b.e || b.s < e;", REGEL],
  ["en vald flytt spärrar inte nästa (brus ger flera rader)", "spärrar.push({ s: k.s, e: k.e }); // nästa kandidat får inte krocka med den här", "// (ingen spärr)", REGEL],
  ["flyttraden blir fakturerbar", 'aktivitet_typ: "flytt", debiterbar: false, objekt_id: null,', 'aktivitet_typ: "flytt", debiterbar: true, objekt_id: null,', REGEL],
  ["flyttraden märks som maskinavvikelse (synk) i stället för flytt", 'kommentar: flyttKommentar(i.objektNamn?.[k.fran], i.objektNamn?.[k.till], k.km), kalla: "flytt",', 'kommentar: flyttKommentar(i.objektNamn?.[k.fran], i.objektNamn?.[k.till], k.km), kalla: "synk",', REGEL],
  ["alla rader räknas som automatisk flytt", 'return rad?.kalla === "flytt";', "return true;", REGEL],
  ["en rad föraren lagt in får gravsten", "if (!rad || !arAutomatiskFlytt(rad)) return null;", "if (!rad) return null;", REGEL],
  ["km visas hela under 5 km", "(km < 10 ? `${km.toFixed(1)", "(km < 5 ? `${km.toFixed(1)", REGEL],
  ["okänd trakt visas som frågetecken", '`${franNamn || "Okänd plats"} →', '`${franNamn || "?"} →', REGEL],
  ["luckor mellan samma objekt räknas", "if (!l.fran_objekt_id || !l.till_objekt_id || l.fran_objekt_id === l.till_objekt_id) continue;", "if (!l.fran_objekt_id || !l.till_objekt_id) continue;", REGEL],

  // ── limmet mot databasen (lib/flyttSynk.ts) ──
  ["segment som inte går att läsa räknas som tomma (dubbletter)", "kunde inte läsas — ingen flyttrad skapas:`, error.message); return null; }", "kunde inte läsas — ingen flyttrad skapas:`, error.message); return new Map(); }", SYNK],
  ["tröskeln till GPS-funktionen är noll", "p_min_min: FLYTT_MIN_MIN", "p_min_min: 0", SYNK],
  ["befintliga rader skickas inte till planeringen", "upptagna: upptagna.get(k) || [], borta: borta.get(k) || [], objektNamn,", "upptagna: [], borta: borta.get(k) || [], objektNamn,", SYNK],
  ["gravstenar skickas inte till planeringen", "upptagna: upptagna.get(k) || [], borta: borta.get(k) || [], objektNamn,", "upptagna: upptagna.get(k) || [], borta: [], objektNamn,", SYNK],
  ["luckans start och slut byter plats", "start: l.start_lokal, slut: l.slut_lokal", "start: l.slut_lokal, slut: l.start_lokal", SYNK],
  ["trakternas namn hämtas inte", 'const { data: namn, error: namnFel } = await supabase.from("dim_objekt")', 'const { data: namn, error: namnFel } = await supabase.from("dim_objekt_finns_inte")', SYNK],
  ["en lucka med fel från GPS-funktionen stoppar inte (RPC saknas ignoreras tyst)", 'return { skapade, skippade: "rpc" };', "continue;", SYNK],

  // ── synksteget (route.ts) ──
  ["flyttsteget körs aldrig", "const flytt = await skapaFlyttRader(supabase, flyttDagar as any);", "const flytt = { skapade: 0 } as any;", ROUTE],
  ["förfiltret släpper igenom dagar med ett objekt", "(objektListaMap[`${ad.medarbetare_id}_${ad.datum}`]?.length || 0) >= 2", "(objektListaMap[`${ad.medarbetare_id}_${ad.datum}`]?.length || 0) >= 0", ROUTE],
  ["flyttsteget får stoppa synken", "console.warn('flytt: steget föll, synken fortsätter:', e?.message || e);", "throw e;", ROUTE],

  // ── Dag, Kväll, Redigera (Arbetsrapport.tsx) ──
  ["Dag/Kväll visar inga flyttrader", "{harMaskinPass && idagFlytt.length > 0 && (", "{false && idagFlytt.length > 0 && (", UI],
  ["Dag/Kväll läser alla segment, inte bara flyttar", ".eq('datum', idagKey).eq('kalla', 'flytt')", ".eq('datum', idagKey)", UI],
  ["raden säger inte att tiden är arbetstid (Dag/Kväll)", "{sg.kommentar ? ` · ${sg.kommentar}` : ''} · räknas som arbetstid", "{sg.kommentar ? ` · ${sg.kommentar}` : ''}", UI],
  ["raden visar ingen längd", "{fmt(periodMin((sg.start_tid||'').slice(0,5), (sg.slut_tid||'').slice(0,5)))}", "{fmt(0)}", UI],
  ["Redigera visar fakturering på en automatisk flytt", "{p.kind==='segment' && p.kalla==='flytt'\n                        ? <span", "{false\n                        ? <span", UI],
  ["Redigera säger inte att flytten är arbetstid", 'color:FARG.text2 }}>räknas som arbetstid</span>', 'color:FARG.text2 }}></span>', UI],
  ["en ändrad tid ger ingen gravsten", "if (arAutomatiskFlytt(periodForm.rad) && (ny5(periodForm.rad.start_tid) !== ny5(v.start) || ny5(periodForm.rad.slut_tid) !== ny5(v.slut))) {", "if (false) {", UI],
  ["en oförändrad tid ger gravsten ändå", "if (arAutomatiskFlytt(periodForm.rad) && (ny5(periodForm.rad.start_tid) !== ny5(v.start) || ny5(periodForm.rad.slut_tid) !== ny5(v.slut))) {", "if (arAutomatiskFlytt(periodForm.rad)) {", UI],
  ["en ändring sparas fast gravstenen föll", "if (!(await skrivFlyttBorta(periodForm.rad))) { setPeriodFel(SPARA_FEL); return; }", "await skrivFlyttBorta(periodForm.rad);", UI],
  ["borttagning utan gravsten", "if (!(await skrivFlyttBorta(periodForm.rad))) { setPeriodFel(RADERA_FEL); return; } // automatisk flytt", "// automatisk flytt", UI],
  ["borttagning fast gravstenen föll", "if (!(await skrivFlyttBorta(periodForm.rad))) { setPeriodFel(RADERA_FEL); return; } // automatisk flytt", "await skrivFlyttBorta(periodForm.rad); // automatisk flytt", UI],
  ["gravstenen skrivs även för en rad föraren lagt in", "const grav = flyttBortaRad(rad);\n    if (!grav) return true;", "const grav = { medarbetare_id: rad.medarbetare_id, datum: rad.datum, start_tid: rad.start_tid, slut_tid: rad.slut_tid };\n    if (!grav) return true;", UI],
  ["en felskriven gravsten ignoreras", "if (error && (error as any).code !== '23505') { console.error('[flytt] gravsten kunde inte skrivas', error); return false; }", "return true;", UI],
  ["flyttraden laddas inte om efter ändring", "        setFlyttVersion(n => n + 1);\n        const sparad = res.rows[0]", "        const sparad = res.rows[0]", UI],
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

// MUT_FILTER=<regex>: kör bara mutanter vars namn matchar (efter att ett test lagts till för en överlevare).
const urval = process.env.MUT_FILTER ? M.filter(([namn]) => new RegExp(process.env.MUT_FILTER, "i").test(namn)) : M;
kor({ filer: [REGEL, SYNK, ROUTE, UI], tester: TESTER, standardFil: REGEL, mutationer: urval });
