// PLANERA — skrivvägen. Samma tabeller och samma regler som arbetsrapportens
// periodformulär (components/arbetsrapport/Arbetsrapport.tsx sparaPeriod /
// taBortPeriod), så en period som skapas här är i alla avseenden en vanlig
// extra_tid-period: samma lön, samma kalender, samma Dag/Redigera.
//
// Vyn skapar BARA perioder. Dagen bekräftas som vanligt.
//
// Reglerna (ur dagsegment-lagret):
//  - ligger perioden INOM dagens maskinpass är den redan betald och ska märkas som
//    segment i Dag/Redigera — inte läggas till här (skulle bli dubbelräknad);
//  - korsar den passets gräns delas den aldrig tyst;
//  - överlappar den en annan period samma dag → begripligt fel;
//  - första perioden på en dag SKAPAR dagen (skalrad utan klockslag);
//  - kvittot byggs på raden databasen gav tillbaka, aldrig på formuläret
//    (sparatSkiljerSig) — "ärlig data eller ingen data";
//  - PÅGÅENDE period (slut = null, "Starta nu") finns bara idag, bara EN åt gången,
//    och räknas som löpande framåt vid krock. Den avslutas med uppdateraPeriod; en
//    glömd period från en tidigare dag får aldrig slut = nu;
//  - framtida tid sparas aldrig (spärren sitter HÄR, vyn visar den bara);
//  - ÄNDRAR man en redan bekräftad dag bryts bekräftelsen (arbetsdag.bekraftad = false) —
//    samma regel som arbetsrapporten: en underskrift gäller det man skrev under;
//  - RASTEN är en lucka mellan perioder, aldrig en siffra på en rad (se logik.ts). `minuter` = slut − start.
//  - sparaDelar skriver en hel dag i delar (klipp och rätta i efterhand) i en ordning där inga två delar
//    någonsin överlappar, och rapporterar exakt vad som hann sparas om något stoppar.

import type { SupabaseClient } from "@supabase/supabase-js";
import { klassificeraPeriod, periodMin, valideraSegment } from "@/lib/dagsegment";
import { aktLabel, type AktivitetTyp } from "@/lib/aktiviteter";
import { raderaVerifierat, uppdateraVerifierat, SPARA_FEL } from "@/lib/supabase-save";
import { DAGENS_SLUT, liggerIFramtiden, startLiggerIFramtiden, klockaTillMin, lokalISO, minTillKlocka, nettoMin, relativDag, timText, type PeriodRad } from "./logik";
import { ordnaSkrivningar, skrivplan, valideraDelar, type DagDel } from "./dag";

/** slut = null → pågående period. kommentar: undefined = rör den inte, string/null = skriv den. */
export type NyPeriod = { datum: string; start: string; slut: string | null; typ: AktivitetTyp; objektId: string | null; deb: boolean; kommentar?: string | null };
const kommentarRen = (k: string | null | undefined) => (k ?? "").trim() || null;
/** Hur det gick med att bryta en befintlig bekräftelse efter en ändring. */
export type Bekraftelse = "bruten" | "misslyckades";
export type SparaSvar = { ok: true; rad: any; bekraftelse?: Bekraftelse } | { ok: false; fel: string };

const hhmm = (t: string | null | undefined) => (t || "").slice(0, 5);

type DagLage = {
  skalrad: any | null;
  pass: { start_tid: string | null; slut_tid: string | null };
  andra: { start_tid: string; slut_tid: string }[];
  /** Finns en annan pågående period (valfri dag)? Bara en åt gången. */
  annanOppen: boolean;
};
async function laddaDag(sb: SupabaseClient, medarbetareId: string, datum: string, undantaId?: string): Promise<DagLage | { fel: string }> {
  const [ad, ex, sg, op] = await Promise.all([
    sb.from("arbetsdag").select("*").eq("medarbetare_id", medarbetareId).eq("datum", datum).maybeSingle(),
    sb.from("extra_tid").select("id, start_tid, slut_tid").eq("medarbetare_id", medarbetareId).eq("datum", datum),
    sb.from("arbetsdag_segment").select("id, start_tid, slut_tid").eq("medarbetare_id", medarbetareId).eq("datum", datum),
    sb.from("extra_tid").select("id").eq("medarbetare_id", medarbetareId).is("slut_tid", null),
  ]);
  if (ad.error || ex.error || sg.error || op.error) { console.error("[planera] kunde inte läsa dagen", ad.error || ex.error || sg.error || op.error); return { fel: SPARA_FEL }; }
  const rad: any = ad.data || null;
  const andra = [
    // En pågående period löper framåt: den upptar dagen från sin start till dagens slut.
    ...((ex.data as any[]) || []).filter(e => e.id !== undantaId && e.start_tid).map(e => ({ start_tid: e.start_tid, slut_tid: e.slut_tid || minTillKlocka(DAGENS_SLUT) })),
    ...((sg.data as any[]) || []).map(s => ({ start_tid: s.start_tid, slut_tid: s.slut_tid })),
  ];
  const annanOppen = ((op.data as any[]) || []).some(e => e.id !== undantaId);
  return { skalrad: rad, pass: { start_tid: rad?.start_tid || null, slut_tid: rad?.slut_tid || null }, andra, annanOppen };
}

/** En ändring på en redan bekräftad dag bryter bekräftelsen — samma regel som arbetsrapporten (bekraftad = false). */
async function brytBekraftelse(sb: SupabaseClient, skalrad: any | null): Promise<Bekraftelse | undefined> {
  if (!skalrad?.bekraftad || !skalrad?.id) return undefined;
  const r = await uppdateraVerifierat(sb, "arbetsdag", { bekraftad: false, bekraftad_tid: null }, { id: skalrad.id });
  if (!r.ok) { console.error("[planera] kunde inte bryta bekräftelsen", r.fel); return "misslyckades"; }
  return "bruten";
}

/** Pågående period: bara idag, start inte i framtiden, ingen annan pågående, inte inom ett maskinpass, ingen krock framåt. */
function kontrolleraOppen(p: NyPeriod, dag: DagLage, nu: Date): { fel: string } | { kalla: string } {
  if (p.datum !== lokalISO(nu)) return { fel: "En period utan sluttid kan bara startas idag. Välj när den slutade." };
  // "Starta nu" startar vid exakt klockan nu, så starten får aldrig ligga efter den.
  if (startLiggerIFramtiden(p.datum, klockaTillMin(p.start), nu)) return { fel: "Perioden ligger i framtiden — inget sparat. Spara den när tiden har varit." };
  if (dag.annanOppen) return { fel: "Du har redan en pågående period — avsluta den först." };
  const s = klockaTillMin(p.start);
  const ps = dag.pass.start_tid ? klockaTillMin(dag.pass.start_tid) : null;
  const pe = dag.pass.slut_tid ? klockaTillMin(dag.pass.slut_tid) : null;
  if (ps != null && s >= ps && (pe == null || s < pe)) {
    return { fel: `Starten ligger inom maskinpasset (${hhmm(dag.pass.start_tid)}–${hhmm(dag.pass.slut_tid)}) och är redan arbetstid. Perioder inom passet märks under Dag eller Kalender.` };
  }
  const val = valideraSegment({ start: p.start, slut: minTillKlocka(DAGENS_SLUT) }, { start_tid: null, slut_tid: null }, dag.andra);
  if (!val.ok) return { fel: val.fel.replace("Överlappar en period du redan märkt", "Krockar med en period du redan lagt in") };
  return { kalla: ps == null ? "under_dagen" : s < ps ? "morgon" : "kvall" };
}

/** Kontroller som gäller både ny period och ändring. Returnerar felet eller lägets "kalla". */
function kontrollera(p: NyPeriod, dag: DagLage, nu: Date): { fel: string } | { kalla: string } {
  if (p.slut == null && p.start) return kontrolleraOppen(p, dag, nu);
  if (!p.start || !p.slut || periodMin(p.start, p.slut) <= 0) return { fel: "Sluttiden måste vara efter starttiden." };
  // Samma regel som i vyn, men HÄR är det spärren: framtida tid är inte arbetad tid
  // (testdata 2026-10-02: 20:17–23:18 sparades kl 16:19).
  if (liggerIFramtiden(p.datum, klockaTillMin(p.slut), nu)) return { fel: "Perioden ligger i framtiden — inget sparat. Spara den när tiden har varit." };
  const lage = klassificeraPeriod({ start: p.start, slut: p.slut }, dag.pass);
  const passText = `${hhmm(dag.pass.start_tid)}–${hhmm(dag.pass.slut_tid)}`;
  if (lage === "inne") return { fel: `Tiden ligger inom maskinpasset (${passText}) och är redan arbetstid. Perioder inom passet märks under Dag eller Kalender.` };
  if (lage === "korsar") return { fel: `Tiden korsar maskinpassets gräns (${passText}). Dela upp den i en före och en efter passet.` };
  const val = valideraSegment({ start: p.start, slut: p.slut }, { start_tid: null, slut_tid: null }, dag.andra);
  if (!val.ok) return { fel: val.fel };
  return { kalla: lage === "utanfor_fore" ? "morgon" : lage === "utanfor_efter" ? "kvall" : "under_dagen" };
}

/** Sparat-skiljer-sig-kontrollen: raden databasen gav tillbaka ska vara det som begärdes. */
export function sparatSkiljerSig(p: NyPeriod, rad: any): string | null {
  const slutStammer = p.slut == null ? !rad?.slut_tid : hhmm(rad?.slut_tid) === p.slut;
  if (hhmm(rad?.start_tid) !== p.start || !slutStammer) return "Perioden sparades, men tiderna följde inte med. Öppna den i veckolistan och kontrollera.";
  if (p.objektId && rad?.objekt_id !== p.objektId) return "Perioden sparades, men trakten följde inte med. Öppna den i veckolistan och välj trakten igen — händer det igen, säg till Martin.";
  if ((rad?.aktivitet_typ || null) !== p.typ) return "Perioden sparades, men aktiviteten följde inte med. Öppna den i veckolistan och kontrollera.";
  if (!!rad?.debiterbar !== p.deb) return 'Perioden sparades, men "faktureras" följde inte med. Öppna den i veckolistan och kontrollera.';
  if (p.slut != null && (rad?.minuter ?? -1) !== periodMin(p.start, p.slut)) return "Perioden sparades, men minuterna stämmer inte med tiden. Öppna den i veckolistan och kontrollera.";
  if (p.kommentar !== undefined && kommentarRen(rad?.kommentar) !== kommentarRen(p.kommentar)) return "Perioden sparades, men kommentaren följde inte med. Öppna den i veckolistan och kontrollera.";
  return null;
}

/** "Trestensdal · idag 07:00–10:00 · 3 tim" — byggs på DB-raden. (Gamla rader med rast_min visar "rast N min".) */
export function kvittoText(rad: any, objektNamn: string | null, idag: string): string {
  if (!rad?.slut_tid) return `${objektNamn || aktLabel(rad?.aktivitet_typ)} · ${relativDag(rad?.datum, idag)} från ${hhmm(rad?.start_tid)} · pågår`;
  const min = rad?.minuter ?? nettoMin(periodMin(hhmm(rad?.start_tid), hhmm(rad?.slut_tid)), rad?.rast_min ?? 0);
  const rast = (rad?.rast_min ?? 0) > 0 ? ` · rast ${rad.rast_min} min` : "";
  return `${objektNamn || aktLabel(rad?.aktivitet_typ)} · ${relativDag(rad?.datum, idag)} ${hhmm(rad?.start_tid)}–${hhmm(rad?.slut_tid)}${rast} · ${timText(min)}`;
}

/** Första perioden på en dag skapar dagen: skalrad utan klockslag, ignoreDuplicates mot race med synk. */
async function sakerstallSkalrad(sb: SupabaseClient, medarbetareId: string, datum: string, finns: any | null): Promise<string | null> {
  if (finns?.id) return finns.id;
  const { error } = await sb.from("arbetsdag").upsert({ medarbetare_id: medarbetareId, datum }, { onConflict: "medarbetare_id,datum", ignoreDuplicates: true });
  if (error) { console.error("[planera] skalrad misslyckades", error); return null; }
  const { data } = await sb.from("arbetsdag").select("id").eq("medarbetare_id", medarbetareId).eq("datum", datum).maybeSingle();
  return (data as any)?.id || null;
}

export async function sparaNyPeriod(sb: SupabaseClient, medarbetareId: string, p: NyPeriod, nu: Date = new Date()): Promise<SparaSvar> {
  try {
    const dag = await laddaDag(sb, medarbetareId, p.datum);
    if ("fel" in dag) return { ok: false, fel: dag.fel };
    const k = kontrollera(p, dag, nu);
    if ("fel" in k) return { ok: false, fel: k.fel };
    const arbetsdagId = await sakerstallSkalrad(sb, medarbetareId, p.datum, dag.skalrad);
    if (!arbetsdagId) return { ok: false, fel: "Kunde inte koppla perioden till dagen — inget sparat. Försök igen." };
    const { data, error } = await sb.from("extra_tid").insert({
      medarbetare_id: medarbetareId, datum: p.datum, arbetsdag_id: arbetsdagId,
      start_tid: p.start + ":00", slut_tid: p.slut == null ? null : p.slut + ":00",
      minuter: p.slut == null ? 0 : periodMin(p.start, p.slut), // INTE genererad kolumn — räknas om på varje skrivväg; pågående = 0 tills den avslutas
      aktivitet_typ: p.typ, objekt_id: p.objektId, debiterbar: p.deb, kommentar: kommentarRen(p.kommentar), kalla: k.kalla,
    }).select().single();
    if (error || !data) { console.error("[planera] insert extra_tid", error); return { ok: false, fel: SPARA_FEL }; }
    const avvik = sparatSkiljerSig(p, data);
    if (avvik) return { ok: false, fel: avvik };
    return { ok: true, rad: data, bekraftelse: await brytBekraftelse(sb, dag.skalrad) };
  } catch (e) {
    console.error("[planera] sparaNyPeriod", e);
    return { ok: false, fel: SPARA_FEL };
  }
}

export async function uppdateraPeriod(sb: SupabaseClient, medarbetareId: string, id: string, p: NyPeriod, nu: Date = new Date()): Promise<SparaSvar> {
  try {
    const dag = await laddaDag(sb, medarbetareId, p.datum, id);
    if ("fel" in dag) return { ok: false, fel: dag.fel };
    const k = kontrollera(p, dag, nu);
    if ("fel" in k) return { ok: false, fel: k.fel };
    const arbetsdagId = await sakerstallSkalrad(sb, medarbetareId, p.datum, dag.skalrad);
    if (!arbetsdagId) return { ok: false, fel: "Kunde inte koppla perioden till dagen — inget sparat. Försök igen." };
    const res = await uppdateraVerifierat(sb, "extra_tid", {
      start_tid: p.start + ":00", slut_tid: p.slut == null ? null : p.slut + ":00", minuter: p.slut == null ? 0 : periodMin(p.start, p.slut),
      // EN rastmodell (lucka): en gammal rad med rast_min nollställs när den rättas, så minuter = slut − start gäller.
      rast_min: null,
      aktivitet_typ: p.typ, objekt_id: p.objektId, debiterbar: p.deb, arbetsdag_id: arbetsdagId, kalla: k.kalla,
      ...(p.kommentar !== undefined ? { kommentar: kommentarRen(p.kommentar) } : {}),
    }, { id }, "*");
    if (!res.ok) return { ok: false, fel: res.fel };
    const rad = res.rows[0];
    const avvik = sparatSkiljerSig(p, rad);
    if (avvik) return { ok: false, fel: avvik };
    return { ok: true, rad, bekraftelse: await brytBekraftelse(sb, dag.skalrad) };
  } catch (e) {
    console.error("[planera] uppdateraPeriod", e);
    return { ok: false, fel: SPARA_FEL };
  }
}

/** En skalrad är tom när dagen saknar pass, maskin, km, traktamente och kommentar. */
export const skalradTom = (r: any): boolean =>
  !!r && !r.start_tid && !r.slut_tid && !r.maskin_id
  && !(r.km_morgon || 0) && !(r.km_kvall || 0) && !(r.km_totalt || 0)
  && !r.traktamente && !r.trak && !r.kommentar;

/** Raderas dagens sista period försvinner den tomma skalraden med (annars blir en tom dag kvar som inte går att göra
 *  något med, 2026-09-28). Policyn arbetsdag_forare_delete_skalrad inte körd: nolla bekräftelsen i stället. */
async function stadaSkalrad(sb: SupabaseClient, medarbetareId: string, datum: string, utanId?: string): Promise<void> {
  const dag = await laddaDag(sb, medarbetareId, datum, utanId);
  if (!("fel" in dag) && dag.andra.length === 0 && dag.skalrad?.id && skalradTom(dag.skalrad)) {
    const del = await raderaVerifierat(sb, "arbetsdag", { id: dag.skalrad.id });
    if (!del.ok && dag.skalrad.bekraftad) await uppdateraVerifierat(sb, "arbetsdag", { bekraftad: false, bekraftad_tid: null }, { id: dag.skalrad.id });
  }
}

/** Ta bort en period. */
export async function raderaPeriod(sb: SupabaseClient, rad: { id: string; datum: string }, medarbetareId: string): Promise<{ ok: true; bekraftelse?: Bekraftelse } | { ok: false; fel: string }> {
  try {
    const dagFore = await laddaDag(sb, medarbetareId, rad.datum, rad.id);
    const res = await raderaVerifierat(sb, "extra_tid", { id: rad.id });
    if (!res.ok) return { ok: false, fel: res.fel };
    const bekr = "fel" in dagFore ? undefined : await brytBekraftelse(sb, dagFore.skalrad);
    await stadaSkalrad(sb, medarbetareId, rad.datum, rad.id);
    return { ok: true, bekraftelse: bekr };
  } catch (e) {
    console.error("[planera] raderaPeriod", e);
    return { ok: false, fel: "Kunde inte ta bort — försök igen." };
  }
}

// ── Hela dagen i delar ────────────────────────────────────────────────────
export type DelSvar =
  | { ok: true; rader: any[]; bekraftelse?: Bekraftelse; nyckelTillId: Record<string, string> }
  | { ok: false; fel: string; nyckelTillId: Record<string, string> };

/**
 * Spara en dag i delar (klipp och rätta). `gamla` = dagens rader i databasen när redigeraren öppnades.
 * 1. Kontrollerar ALLA delar mot maskinpasset/framtiden INNAN något skrivs (stoppar rakt, inget halvsparat).
 * 2. Skriver raderingar, ändringar och nya delar i en ordning där två delar aldrig överlappar ens tillfälligt;
 *    varje skrivning går genom samma kontroller som en enskild period (krock mot rader Planera inte äger, osv).
 * 3. Läser tillbaka dagens rader ur databasen — kvittot byggs på dem, aldrig på redigeraren.
 * Stoppar något halvvägs returneras felet OCH nyckelTillId för de delar som hann infogas, så redigeraren kan
 * fortsätta därifrån i stället för att infoga dubbletter.
 */
export async function sparaDelar(sb: SupabaseClient, medarbetareId: string, datum: string, gamla: PeriodRad[], delar: DagDel[], nu: Date = new Date()): Promise<DelSvar> {
  const nyckelTillId: Record<string, string> = {};
  const stopp = (fel: string): DelSvar => ({ ok: false, fel, nyckelTillId });
  try {
    const dag = await laddaDag(sb, medarbetareId, datum);
    if ("fel" in dag) return stopp(dag.fel);
    // Kopia av skalraden som den såg ut INNAN något skrevs: skrivningarna nedan bryter bekräftelsen själva, och vi ska
    // ändå kunna säga att dagen VAR bekräftad.
    const skalradFore = dag.skalrad ? { ...dag.skalrad } : null;
    const fel = valideraDelar(delar, { datum, pass: dag.pass, nu });
    if (fel) return stopp(fel);
    const plan = skrivplan(gamla, delar);
    const ordning = ordnaSkrivningar(gamla, plan);
    if (!ordning) return stopp("Ändringarna går inte att spara i en ordning utan att två delar tillfälligt överlappar. Spara i två steg: flytta först det ena, spara, och gör sedan resten.");
    let skrivet = 0;
    for (const op of ordning) {
      if (op.typ === "radera") {
        const r = await raderaVerifierat(sb, "extra_tid", { id: op.id });
        if (!r.ok) return stopp(r.fel);
        skrivet++;
        continue;
      }
      const p: NyPeriod = { datum, start: minTillKlocka(op.del.start), slut: minTillKlocka(op.del.slut), typ: op.del.typ as AktivitetTyp, objektId: op.del.objektId, deb: op.del.deb, kommentar: op.del.kommentar };
      const svar = op.typ === "uppdatera" ? await uppdateraPeriod(sb, medarbetareId, op.id, p, nu) : await sparaNyPeriod(sb, medarbetareId, p, nu);
      if (!svar.ok) return stopp(skrivet ? `${svar.fel} (${skrivet} av ${ordning.length} ändringar hann sparas — öppna dagen igen och kontrollera.)` : svar.fel);
      if (op.typ === "infoga") nyckelTillId[op.del.nyckel] = svar.rad.id;
      skrivet++;
    }
    if (plan.radera.length && !plan.uppdatera.length && !plan.infoga.length) await stadaSkalrad(sb, medarbetareId, datum);
    const bekraftelse = skrivet > 0 ? await brytBekraftelse(sb, skalradFore) : undefined;
    // Kvittot byggs på det som ligger i databasen nu — inte på redigeraren.
    const { data, error } = await sb.from("extra_tid").select("*").eq("medarbetare_id", medarbetareId).eq("datum", datum);
    if (error) { console.error("[planera] läs tillbaka dagen", error); return stopp("Dagen sparades men kunde inte läsas tillbaka — öppna den i veckolistan och kontrollera."); }
    const ids = new Set([...delar.filter(d => d.radId).map(d => d.radId as string), ...Object.values(nyckelTillId)]);
    const rader = ((data as any[]) || []).filter(r => ids.has(r.id) && r.slut_tid).sort((a, b) => hhmm(a.start_tid).localeCompare(hhmm(b.start_tid)));
    return { ok: true, rader, bekraftelse, nyckelTillId };
  } catch (e) {
    console.error("[planera] sparaDelar", e);
    return stopp(SPARA_FEL);
  }
}
