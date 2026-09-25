// Frånvaro — EN källa, EN taxonomi. Arbetsrapportens morgonkort, Kalendern,
// Kontroll-steget, Min tid, löneberäkningen och ledighetsvyn läser härifrån.
//
// SAMLAD MODELL (beslut 2026-09-17, docs/lonesystem/franvaromodell.md):
// ledighet_ansokningar är den enda frånvarotabellen. En rad = en period
// (startdatum–slutdatum) för en medarbetare.
//   Steg 1 (migration 20260917100000): schemat vidgat — nio typer, status
//     'registrerad', ersatter_datum (skoftning), kalla.
//   Steg 2 (2026-09-18): morgonkortet skriver hit (registreraFranvaro), de två
//     dagtyp-raderna backfillade (migration 20260918110000), alla läsare går
//     via hamtaFranvaro/franvaroPerDatum.
//   Steg 3 (2026-09-25): arbetsdag.dagtyp läses INGENSTANS som frånvaro. De
//     två gamla raderna sattes till 'normal' (migration 20260925110000) och
//     kolumnen fick en CHECK på Produktion/normal — dagtyp betyder bara "sorts
//     maskindag" igen. Det döda skärmparet som skrev dagtyp togs bort.
//
// Vad som RÄKNAS som frånvaro: status 'godkänd' (ansökt och beviljad) eller
// 'registrerad' (anmäld på morgonen). 'väntar' och 'nekad' är inte frånvaro.
// "Arbete vinner": en dag med arbetspass räknas som arbete även om en
// frånvarorad täcker den — det avgörs i läsaren, aldrig här.
import { getRödaDagar } from "./roda-dagar";
import { SKARP_START } from "./skarpStart";

/** Alla frånvarotyper i den samlade modellen (= CHECK i ledighet_ansokningar). */
export const FRANVARO_TYPER = [
  "semester",      // intjänad, ansöks
  "atk",           // intjänad (§6), ansöks
  "komp",          // intjänad (§8 mom 3: 1,4 tim per övertidstimme), ansöks — räknas inte som övertid enligt ATL (§5 mom 5 anm 3)
  "sjuk",          // anmäls på morgonen (status 'registrerad')
  "vab",           // anmäls på morgonen
  "foraldraledig", // anmäls på morgonen (planerad föräldraledighet kan ansökas)
  "inarbetad",     // skoftning §5 mom 4 — kräver ersatter_datum; ingen helglön flyttas
  "tjanstledig",   // ej intjänad; omger den en helgdag → ingen helglön (§10 mom 4)
  "permission",    // kort ledighet med lön
] as const;
export type FranvaroTyp = (typeof FRANVARO_TYPER)[number];

/** Ansökt ledighet går väntar → godkänd/nekad. Anmäld frånvaro (sjuk/vab/
 *  föräldraledig från morgonkortet) är 'registrerad' direkt — ingen godkännare. */
export type FranvaroStatus = "väntar" | "godkänd" | "nekad" | "registrerad";

/** Statusar som BETYDER frånvaro. Väntande och nekade rader är det inte. */
export const FRANVARO_STATUS_GALLER: readonly FranvaroStatus[] = ["godkänd", "registrerad"];

/** Var raden kom ifrån. */
export type FranvaroKalla = "ansokan" | "morgonkort" | "admin" | "backfill";

/** Typer som anmäls (kan vara 'registrerad'), inte ansöks. = RLS-spärren för egen insert. */
export const FRANVARO_ANMALS: readonly FranvaroTyp[] = ["sjuk", "vab", "foraldraledig"];

/** Intjänad ledighet — bryter inte helglön även efter 30 dagar (§10 mom 4). */
export const FRANVARO_INTJANAD: readonly FranvaroTyp[] = ["semester", "atk", "komp"];

/** Rubrik per typ ("Sjukdag — måndag 7 september"). */
export const FRANVARO_TYP_RUBRIK: Record<FranvaroTyp, string> = {
  semester: "Semester",
  atk: "ATK",
  komp: "Kompledighet",
  sjuk: "Sjukdag",
  vab: "VAB",
  foraldraledig: "Föräldraledig",
  inarbetad: "Inarbetad dag",
  tjanstledig: "Tjänstledig",
  permission: "Permission",
};

/** Kort ord per typ — kalenderns celler och luck-texter, där utrymmet är litet. */
export const FRANVARO_ORD: Record<FranvaroTyp, string> = {
  semester: "Semester",
  atk: "ATK",
  komp: "Komp",
  sjuk: "Sjuk",
  vab: "VAB",
  foraldraledig: "Föräldr.",
  inarbetad: "Inarbetad",
  tjanstledig: "Tjänstl.",
  permission: "Permission",
};

export function arFranvaroTyp(typ: string | null | undefined): typ is FranvaroTyp {
  return !!typ && (FRANVARO_TYPER as readonly string[]).includes(typ);
}

// ── Morgonkortets val ────────────────────────────────────────

export type FranvaroVal = {
  id: FranvaroTyp;
  /** Knapp-/listetikett. */
  label: string;
  /** Material Symbol. */
  ikon: string;
  /** Helskärmsbekräftelsen efter registrering. */
  meddelande: string;
};

/** De frånvarotyper föraren kan anmäla på morgonen. Ordningen är visningsordningen.
 *  Måste vara en delmängd av FRANVARO_ANMALS — RLS släpper bara igenom dem som 'registrerad'. */
export const FRANVARO_VAL: readonly FranvaroVal[] = [
  { id: "sjuk",          label: "Sjukfrånvaro",  ikon: "medical_services", meddelande: "Krya på dig!" },
  { id: "vab",           label: "VAB",           ikon: "child_care",       meddelande: "VAB registrerad" },
  { id: "foraldraledig", label: "Föräldraledig", ikon: "family_restroom",  meddelande: "Föräldraledighet registrerad" },
] as const;

/** Underraden på frånvarokortet: man ska se vad som finns under utan att trycka. */
export const FRANVARO_UNDERRAD = FRANVARO_VAL.map((v) => v.label === "Sjukfrånvaro" ? "Sjuk" : v.label).join(", ");

// ── Läsa ─────────────────────────────────────────────────────

export type FranvaroRad = {
  id?: string;
  medarbetare_id: string;
  typ: FranvaroTyp;
  startdatum: string;   // YYYY-MM-DD
  slutdatum: string;    // YYYY-MM-DD
  status: FranvaroStatus;
  ersatter_datum?: string | null;
  /** Deldag (migration 20260925100000): frånvaron började/slutade mitt på dagen. "HH:MM[:SS]". */
  fran_tid?: string | null;
  till_tid?: string | null;
};

/** Kolumnerna libben läser — EN lista så select och typ inte glider isär. */
const FRANVARO_KOLUMNER = "id, medarbetare_id, typ, startdatum, slutdatum, status, ersatter_datum, fran_tid, till_tid";

// ── Deldag ───────────────────────────────────────────────────
// En rad med minst ett klockslag är en DELDAG: frånvaro från fran_tid (eller
// dagens början) till till_tid (eller dagens slut), på EN dag. Skogsavtalet
// §12 mom 3 räknar karens och sjuklön i timmar ("per timme som den anställde
// skulle ha arbetat"), så det spelar roll hur många timmar man hann jobba.
//
// REGELN "ARBETE VINNER" GÄLLER BARA HELDAGSRADER. En heldagsfrånvaro på en
// arbetad dag är arbete (som förut — annars lägger sig en gammal heldagsrad
// ovanpå en arbetad dag och ger både lön och frånvaro för samma timmar).
// En deldagsrad betyder arbete PLUS frånvaro: förmiddagen är arbetstid,
// eftermiddagen är frånvaro. Timmarna HÄRLEDS (deldagTimmar), lagras aldrig.

/** Typer som får vara del av dag (= CHECK ledighet_deldag_regler). Semester är hela dagar, inarbetad alltid hel. */
export const FRANVARO_DELDAG_TYPER: readonly FranvaroTyp[] = ["sjuk", "vab", "foraldraledig", "atk", "komp", "permission", "tjanstledig"];

export function arDeldag(r: { fran_tid?: string | null; till_tid?: string | null }): boolean {
  return !!(r.fran_tid || r.till_tid);
}

export type Deldag = { typ: FranvaroTyp; fran_tid: string | null; till_tid: string | null; status?: FranvaroStatus };

/** "11:30:00" → "11:30" */
export function fmtKlockslag(t: string | null | undefined): string {
  return t ? String(t).slice(0, 5) : "";
}

/**
 * Deldagsrader per datum (bara sådana som gäller — anroparen filtrerar status).
 * Första raden per datum vinner.
 */
export function deldagarPerDatum(rader: FranvaroRad[], fran: string, till: string): Record<string, Deldag> {
  const ut: Record<string, Deldag> = {};
  for (const r of rader) {
    if (!arDeldag(r) || !arFranvaroTyp(r.typ)) continue;
    const d = r.startdatum;
    if (d < fran || d > till || ut[d]) continue;
    ut[d] = { typ: r.typ, fran_tid: r.fran_tid ?? null, till_tid: r.till_tid ?? null, status: r.status };
  }
  return ut;
}

/**
 * Frånvarotimmar för en deldag = timmar föraren SKULLE ha arbetat minus
 * arbetade. Schematimmar per dag = ordinarie_vecka_h / 5 (8 vid 40) — ett
 * ANTAGANDE tills Martin beslutat schema/förläggningscykel (§12 mom 3 anm 2:
 * oregelbunden tid → genomsnitt per månad eller cykel; samma beslut som
 * beräkningsperioden för övertid). Aldrig negativt, aldrig över schemat.
 */
export function deldagTimmar(schemaTimmarPerDag: number, arbetadMin: number | null | undefined): number {
  const h = schemaTimmarPerDag - (arbetadMin || 0) / 60;
  return Math.round(Math.max(0, Math.min(schemaTimmarPerDag, h)) * 10) / 10;
}

/** Schematimmar per dag ur avtalets ordinarie veckoarbetstid (40 → 8). */
export function schemaTimmarPerDag(ordinarieVeckaH: number | null | undefined): number {
  const v = Number(ordinarieVeckaH);
  return Number.isFinite(v) && v > 0 ? v / 5 : 8;
}

/**
 * Frånvarorader som ÖVERLAPPAR [fran, till] och gäller (godkänd/registrerad).
 * `medarbetareId` utelämnad = alla (lönen, schemat). Fel returneras, kastas
 * inte — läsaren avgör om det är stopp (lönen) eller tom lista (kalendern).
 */
export async function hamtaFranvaro(
  supabase: any,
  p: { medarbetareId?: string; fran: string; till: string; statusar?: readonly FranvaroStatus[] },
): Promise<{ rader: FranvaroRad[]; fel: string | null }> {
  let q = supabase
    .from("ledighet_ansokningar")
    .select(FRANVARO_KOLUMNER)
    // Default: bara det som GÄLLER. Arbetsrapporten tar även 'väntar' för att
    // visa ett bytesdags-svar som väntar på godkännande — men filtrerar själv
    // bort väntande ur frånvarokartan.
    .in("status", (p.statusar ?? FRANVARO_STATUS_GALLER) as string[])
    .lte("startdatum", p.till)
    .gte("slutdatum", p.fran);
  if (p.medarbetareId) q = q.eq("medarbetare_id", p.medarbetareId);
  const { data, error } = await q;
  if (error) return { rader: [], fel: error.message || String(error) };
  return { rader: (data || []) as FranvaroRad[], fel: null };
}

/**
 * Expanderar HELDAGSRADER till datum → typ inom [fran, till]. Deldagsrader
 * (klockslag) hör inte hit — de bor i deldagarPerDatum, för på en deldag är
 * dagen arbete OCH frånvaro. Första raden per datum vinner (två överlappande
 * rader är ett datafel som granskningen får se via ledighetskollision, inte
 * något som döljs här).
 */
export function franvaroPerDatum(rader: FranvaroRad[], fran: string, till: string): Record<string, FranvaroTyp> {
  const ut: Record<string, FranvaroTyp> = {};
  for (const r of rader) {
    if (!r.startdatum || !r.slutdatum || !arFranvaroTyp(r.typ)) continue;
    if (arDeldag(r)) continue;
    const start = new Date(r.startdatum + "T00:00:00");
    const slut = new Date(r.slutdatum + "T00:00:00");
    for (const d = new Date(start); d <= slut; d.setDate(d.getDate() + 1)) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (iso < fran || iso > till) continue;
      if (!ut[iso]) ut[iso] = r.typ;
    }
  }
  return ut;
}

// ── Bytesdag (skoftning §5 mom 4) ────────────────────────────
// typ 'inarbetad': startdatum = den lediga vardagen, ersatter_datum = den röda
// vardagen som arbetades i stället. Lönen: den röda dagens timmar är
// ordinarie tid (+ söndagstillägg om beordrat), den lediga dagen är ledighet
// utan avdrag, helglönen flyttas INTE. Reglerna i DB: migration
// 20260921100000 (en vardag, unik per person och röd dag).

export type Byte = { ledig: string; ersatter: string; ersatterNamn: string; status?: FranvaroStatus };

/** Avtalets "vid ett och samma tillfälle": så långt isär får den lediga och den röda dagen ligga. */
export const BYTE_MAX_DAGAR = 183;

/**
 * Röda VARDAGAR (mån–fre) ur lib/roda-dagar som kan bytas mot en ledig dag —
 * samma källa som kalendern och helglönen. Inom ±183 dagar från `kringDatum`
 * (avtalet: ledighet och inarbetning överenskoms "lämpligen vid ett och samma
 * tillfälle" — ett byte över ett halvår är inte det), och ALDRIG före skarp
 * start (Martin 2026-09-24: "det är kört, det är betalt och färdigt, det får
 * vara nu och framåt" — gamla röda dagar är redan utbetalda).
 */
export function rodaVardagarForByte(kringDatum: string): { datum: string; namn: string }[] {
  const ar = Number(kringDatum.slice(0, 4));
  if (!Number.isInteger(ar)) return [];
  const mitt = new Date(kringDatum + "T00:00:00").getTime();
  const ut: { datum: string; namn: string }[] = [];
  for (const y of [ar - 1, ar, ar + 1]) {
    for (const [datum, namn] of Object.entries(getRödaDagar(y))) {
      if (datum < SKARP_START) continue;
      const d = new Date(datum + "T00:00:00");
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      if (Math.abs(d.getTime() - mitt) > BYTE_MAX_DAGAR * 86400000) continue;
      ut.push({ datum, namn });
    }
  }
  return ut.sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Är datumet en röd vardag enligt lib/roda-dagar? Namnet om ja. */
export function rodVardagNamn(datum: string): string | null {
  const namn = getRödaDagar(Number(datum.slice(0, 4)))[datum];
  if (!namn) return null;
  const dow = new Date(datum + "T00:00:00").getDay();
  return dow === 0 || dow === 6 ? null : namn;
}

/**
 * Bytena ur raderna: ledig dag → röd dag, och röd dag → ledig dag. Bara typ
 * 'inarbetad' med ersatter_datum. Anroparen väljer statusar (kalendern:
 * godkänd; formuläret: även väntar för att stoppa dubbelval).
 */
export function bytenPerDatum(rader: FranvaroRad[]): { ledig: Record<string, Byte>; rod: Record<string, Byte> } {
  const ledig: Record<string, Byte> = {}, rod: Record<string, Byte> = {};
  for (const r of rader) {
    if (r.typ !== "inarbetad" || !r.ersatter_datum) continue;
    const b: Byte = { ledig: r.startdatum, ersatter: r.ersatter_datum, ersatterNamn: rodVardagNamn(r.ersatter_datum) || "röd dag", status: r.status };
    if (!ledig[b.ledig]) ledig[b.ledig] = b;
    if (!rod[b.ersatter]) rod[b.ersatter] = b;
  }
  return { ledig, rod };
}

/**
 * Arbetade röda vardagar som fortfarande KAN bytas mot en ledig dag: röd
 * vardag enligt lib/roda-dagar, arbetad, inte redan bytt (byten.rod), inte
 * avböjd (arbetsdag.bytesdag_avbojd_at), inom BYTE_MAX_DAGAR bakåt från idag
 * och aldrig före SKARP_START (redan utbetalt — "nu och framåt").
 * Samma regler som #572; används av Dag-vyns väntar-kort och Redigera så
 * bytet når även dagar som bekräftades innan man tänkte på det.
 */
export function bytbaraRodaDagar(
  dagar: { datum: string; arbetad_min?: number | null; start_tid?: string | null; bytesdag_avbojd_at?: string | null }[],
  bytenRod: Record<string, Byte>,
  idag: string,
): { datum: string; namn: string }[] {
  const idagMs = new Date(idag + "T00:00:00").getTime();
  const ut: { datum: string; namn: string }[] = [];
  for (const d of dagar) {
    if (!d.datum || d.datum > idag || d.datum < SKARP_START) continue;
    if (!((d.arbetad_min || 0) > 0 || d.start_tid)) continue;
    if (d.bytesdag_avbojd_at || bytenRod[d.datum]) continue;
    const namn = rodVardagNamn(d.datum);
    if (!namn) continue;
    if ((idagMs - new Date(d.datum + "T00:00:00").getTime()) / 86400000 > BYTE_MAX_DAGAR) continue;
    ut.push({ datum: d.datum, namn });
  }
  return ut.sort((a, b) => a.datum.localeCompare(b.datum));
}

/**
 * Får `ledig` bytas mot den röda vardagen `ersatter`? null = ja, annars
 * skälet i klartext (för formuläret och Bekräfta-frågan — samma regler som
 * databasens spärr plus röd-dag-kunskapen som bara koden har).
 */
export function bytesdagFel(ledig: string, ersatter: string, franvaroDagar: Record<string, FranvaroTyp> = {}): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ledig)) return "Välj en dag.";
  const dow = new Date(ledig + "T00:00:00").getDay();
  if (dow === 0 || dow === 6) return "Den lediga dagen måste vara en vardag (mån–fre).";
  const rodNamn = rodVardagNamn(ledig);
  if (rodNamn) return `${ledig} är redan röd dag (${rodNamn}) — välj en vanlig vardag.`;
  if (ledig === ersatter) return "Den lediga dagen kan inte vara samma som den röda.";
  if (!rodVardagNamn(ersatter)) return `${ersatter} är ingen röd vardag.`;
  if (ersatter < SKARP_START) return `${ersatter} är redan utbetald — byten gäller från ${SKARP_START} och framåt.`;
  const diff = Math.abs(new Date(ledig + "T00:00:00").getTime() - new Date(ersatter + "T00:00:00").getTime()) / 86400000;
  if (diff > BYTE_MAX_DAGAR) return `Högst ett halvår från den röda dagen (${BYTE_MAX_DAGAR} dagar).`;
  if (franvaroDagar[ledig]) return `${ledig} är redan ${FRANVARO_TYP_RUBRIK[franvaroDagar[ledig]].toLowerCase()}.`;
  return null;
}

/**
 * Ansöker om bytesdag från Arbetsrapporten (Bekräfta-frågan): typ 'inarbetad',
 * status 'väntar' (godkännare godkänner — avtalet: ledighet och inarbetning
 * överenskoms samtidigt), kalla 'morgonkort' = förarens egen registrering i
 * arbetsrapporten. Samma rad som Ledighet-vyns formulär skapar.
 */
export async function ansokBytesdag(
  supabase: any,
  p: { medarbetareId: string; namn: string; ledig: string; ersatter: string },
): Promise<{ ok: true; rad: FranvaroRad } | { ok: false; fel: string }> {
  const fel = bytesdagFel(p.ledig, p.ersatter);
  if (fel) return { ok: false, fel };
  const { data, error } = await supabase
    .from("ledighet_ansokningar")
    .insert({
      medarbetare_id: p.medarbetareId,
      anvandare_id: p.namn,
      typ: "inarbetad",
      startdatum: p.ledig,
      slutdatum: p.ledig,
      ersatter_datum: p.ersatter,
      status: "väntar",
      kalla: "morgonkort",
      skapad_av: p.namn,
      kommentar: `Jobbade ${rodVardagNamn(p.ersatter)} ${p.ersatter}, ledig ${p.ledig} i stället (via Bekräfta)`,
    })
    .select(FRANVARO_KOLUMNER)
    .single();
  if (error || !data) {
    const m = String(error?.message || "");
    return { ok: false, fel: /idx_ledighet_inarbetad_unik/.test(m) ? "Den röda dagen är redan bytt." : (m || "Kunde inte spara bytet.") };
  }
  return { ok: true, rad: data as FranvaroRad };
}

// ── Skriva (morgonkortet) ────────────────────────────────────

/**
 * Anmäler frånvaro för EN dag: en rad med status 'registrerad', kalla
 * 'morgonkort'. RLS (ledighet_insert_egen) kräver egen medarbetare_id och
 * typ i FRANVARO_ANMALS. anvandare_id är visningsnamn, som ledighetsvyn.
 * En registrerad rad kan föraren inte själv ta bort (delete_egen kräver
 * 'väntar') — "arbete vinner" om dagen ändå blir arbetad; annars godkännare.
 */
export async function registreraFranvaro(
  supabase: any,
  p: { medarbetareId: string; namn: string; datum: string; typ: FranvaroTyp; franTid?: string | null; tillTid?: string | null },
): Promise<{ ok: true; rad: FranvaroRad } | { ok: false; fel: string }> {
  if (!FRANVARO_ANMALS.includes(p.typ)) return { ok: false, fel: `${p.typ} ansöks i Ledighet, anmäls inte här.` };
  const deldag = !!(p.franTid || p.tillTid);
  if (deldag && !FRANVARO_DELDAG_TYPER.includes(p.typ)) return { ok: false, fel: `${FRANVARO_TYP_RUBRIK[p.typ]} kan inte vara del av dag.` };
  if (p.franTid && p.tillTid && p.franTid >= p.tillTid) return { ok: false, fel: "Från-tiden måste vara före till-tiden." };
  const { data, error } = await supabase
    .from("ledighet_ansokningar")
    .insert({
      medarbetare_id: p.medarbetareId,
      anvandare_id: p.namn,
      typ: p.typ,
      startdatum: p.datum,
      slutdatum: p.datum,
      status: "registrerad",
      kalla: "morgonkort",
      skapad_av: p.namn,
      // Deldag: klockslaget föraren vet. Timmarna härleds, lagras aldrig.
      fran_tid: p.franTid || null,
      till_tid: p.tillTid || null,
    })
    .select(FRANVARO_KOLUMNER)
    .single();
  if (error || !data) return { ok: false, fel: error?.message || "Kunde inte spara frånvaron." };
  return { ok: true, rad: data as FranvaroRad };
}
