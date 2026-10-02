// PLANERA — skrivvägen. Samma tabeller och samma regler som arbetsrapportens
// periodformulär (components/arbetsrapport/Arbetsrapport.tsx sparaPeriod /
// taBortPeriod), så en period som skapas här är i alla avseenden en vanlig
// extra_tid-period: samma lön, samma kalender, samma Dag/Redigera.
//
// Vyn skapar BARA perioder. Dagen bekräftas som vanligt.
//
// Reglerna (ur dagsegment-lagret):
//  - ligger perioden INOM maskinpasset är den redan betald och ska märkas som
//    segment i Dag/Redigera — inte läggas till här (skulle bli dubbelräknad);
//  - korsar den passets gräns delas den aldrig tyst;
//  - överlappar den en annan period samma dag → begripligt fel;
//  - första perioden på en dag SKAPAR dagen (skalrad utan klockslag);
//  - kvittot byggs på raden databasen gav tillbaka, aldrig på formuläret
//    (sparatSkiljerSig) — "ärlig data eller ingen data";
//  - PÅGÅENDE period (slut = null, "Starta nu — avsluta sen") finns bara idag, bara
//    EN åt gången, och räknas som löpande framåt vid krock. Den avslutas med
//    uppdateraPeriod; en glömd period från en tidigare dag får aldrig slut = nu.
//  - framtida tid sparas aldrig (spärren sitter HÄR, vyn visar den bara).

import type { SupabaseClient } from "@supabase/supabase-js";
import { klassificeraPeriod, periodMin, valideraSegment } from "@/lib/dagsegment";
import { aktLabel, type AktivitetTyp } from "@/lib/aktiviteter";
import { raderaVerifierat, uppdateraVerifierat, SPARA_FEL } from "@/lib/supabase-save";
import { DAGENS_SLUT, liggerIFramtiden, klockaTillMin, lokalISO, minTillKlocka, relativDag, timText } from "./logik";

/** slut = null → pågående period. kommentar: undefined = rör den inte, string/null = skriv den. */
export type NyPeriod = { datum: string; start: string; slut: string | null; typ: AktivitetTyp; objektId: string | null; deb: boolean; kommentar?: string | null };
const kommentarRen = (k: string | null | undefined) => (k ?? "").trim() || null;
export type SparaSvar = { ok: true; rad: any } | { ok: false; fel: string };

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

/** Kontroller som gäller både ny period och ändring. Returnerar felet eller lägets "kalla". */
/** Pågående period: bara idag, start inte i framtiden, ingen annan pågående, inte inom ett maskinpass, ingen krock framåt. */
function kontrolleraOppen(p: NyPeriod, dag: DagLage, nu: Date): { fel: string } | { kalla: string } {
  if (p.datum !== lokalISO(nu)) return { fel: "En period utan sluttid kan bara startas idag. Välj när den slutade." };
  if (klockaTillMin(p.start) > nu.getHours() * 60 + nu.getMinutes()) return { fel: "Perioden ligger i framtiden — inget sparat. Spara den när tiden har varit." };
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
  if (p.kommentar !== undefined && kommentarRen(rad?.kommentar) !== kommentarRen(p.kommentar)) return "Perioden sparades, men kommentaren följde inte med. Öppna den i veckolistan och kontrollera.";
  return null;
}

/** "Trestensdal · idag 07:00–10:00 · 3 tim" — byggs på DB-raden. */
export function kvittoText(rad: any, objektNamn: string | null, idag: string): string {
  if (!rad?.slut_tid) return `${objektNamn || aktLabel(rad?.aktivitet_typ)} · ${relativDag(rad?.datum, idag)} från ${hhmm(rad?.start_tid)} · pågår`;
  const min = rad?.minuter ?? periodMin(hhmm(rad?.start_tid), hhmm(rad?.slut_tid));
  return `${objektNamn || aktLabel(rad?.aktivitet_typ)} · ${relativDag(rad?.datum, idag)} ${hhmm(rad?.start_tid)}–${hhmm(rad?.slut_tid)} · ${timText(min)}`;
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
    return { ok: true, rad: data };
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
      aktivitet_typ: p.typ, objekt_id: p.objektId, debiterbar: p.deb, arbetsdag_id: arbetsdagId, kalla: k.kalla,
      ...(p.kommentar !== undefined ? { kommentar: kommentarRen(p.kommentar) } : {}),
    }, { id }, "*");
    if (!res.ok) return { ok: false, fel: res.fel };
    const rad = res.rows[0];
    const avvik = sparatSkiljerSig(p, rad);
    if (avvik) return { ok: false, fel: avvik };
    return { ok: true, rad };
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

/** Ta bort en period. Raderas dagens sista period försvinner den tomma skalraden med
 *  (annars blir en tom dag kvar som inte går att göra något med, 2026-09-28). */
export async function raderaPeriod(sb: SupabaseClient, rad: { id: string; datum: string }, medarbetareId: string): Promise<{ ok: true } | { ok: false; fel: string }> {
  try {
    const res = await raderaVerifierat(sb, "extra_tid", { id: rad.id });
    if (!res.ok) return { ok: false, fel: res.fel };
    const dag = await laddaDag(sb, medarbetareId, rad.datum, rad.id);
    if (!("fel" in dag) && dag.andra.length === 0 && dag.skalrad?.id && skalradTom(dag.skalrad)) {
      const del = await raderaVerifierat(sb, "arbetsdag", { id: dag.skalrad.id });
      // Policyn arbetsdag_forare_delete_skalrad inte körd: nolla bekräftelsen i stället, så dagen aldrig blir låst.
      if (!del.ok && dag.skalrad.bekraftad) await uppdateraVerifierat(sb, "arbetsdag", { bekraftad: false, bekraftad_tid: null }, { id: dag.skalrad.id });
    }
    return { ok: true };
  } catch (e) {
    console.error("[planera] raderaPeriod", e);
    return { ok: false, fel: "Kunde inte ta bort — försök igen." };
  }
}
