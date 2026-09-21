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
//     via hamtaFranvaro/franvaroPerDatum. arbetsdag.dagtyp läses INTE längre
//     som frånvarokälla — bara som spärr så att de två gamla raderna (0 min,
//     ingen tid) inte räknas som kortpass (DAGTYP_FRANVARO_LEGACY).
//   Steg 3: dagtyp-värdena nollas och DAGTYP_FRANVARO_LEGACY tas bort.
//
// Vad som RÄKNAS som frånvaro: status 'godkänd' (ansökt och beviljad) eller
// 'registrerad' (anmäld på morgonen). 'väntar' och 'nekad' är inte frånvaro.
// "Arbete vinner": en dag med arbetspass räknas som arbete även om en
// frånvarorad täcker den — det avgörs i läsaren, aldrig här.
import { getRödaDagar } from "./roda-dagar";

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
};

/**
 * Frånvarorader som ÖVERLAPPAR [fran, till] och gäller (godkänd/registrerad).
 * `medarbetareId` utelämnad = alla (lönen, schemat). Fel returneras, kastas
 * inte — läsaren avgör om det är stopp (lönen) eller tom lista (kalendern).
 */
export async function hamtaFranvaro(
  supabase: any,
  p: { medarbetareId?: string; fran: string; till: string },
): Promise<{ rader: FranvaroRad[]; fel: string | null }> {
  let q = supabase
    .from("ledighet_ansokningar")
    .select("id, medarbetare_id, typ, startdatum, slutdatum, status, ersatter_datum")
    .in("status", FRANVARO_STATUS_GALLER as string[])
    .lte("startdatum", p.till)
    .gte("slutdatum", p.fran);
  if (p.medarbetareId) q = q.eq("medarbetare_id", p.medarbetareId);
  const { data, error } = await q;
  if (error) return { rader: [], fel: error.message || String(error) };
  return { rader: (data || []) as FranvaroRad[], fel: null };
}

/**
 * Expanderar rader till datum → typ inom [fran, till]. Första raden per datum
 * vinner (två överlappande rader är ett datafel som granskningen får se via
 * ledighetskollision, inte något som döljs här).
 */
export function franvaroPerDatum(rader: FranvaroRad[], fran: string, till: string): Record<string, FranvaroTyp> {
  const ut: Record<string, FranvaroTyp> = {};
  for (const r of rader) {
    if (!r.startdatum || !r.slutdatum || !arFranvaroTyp(r.typ)) continue;
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

export type Byte = { ledig: string; ersatter: string; ersatterNamn: string };

/**
 * Röda VARDAGAR (mån–fre) ur lib/roda-dagar som kan bytas mot en ledig dag —
 * samma källa som kalendern och helglönen. Inom ±183 dagar från `kringDatum`
 * (avtalet: ledighet och inarbetning överenskoms "lämpligen vid ett och samma
 * tillfälle" — ett byte över ett halvår är inte det).
 */
export function rodaVardagarForByte(kringDatum: string): { datum: string; namn: string }[] {
  const ar = Number(kringDatum.slice(0, 4));
  if (!Number.isInteger(ar)) return [];
  const mitt = new Date(kringDatum + "T00:00:00").getTime();
  const ut: { datum: string; namn: string }[] = [];
  for (const y of [ar - 1, ar, ar + 1]) {
    for (const [datum, namn] of Object.entries(getRödaDagar(y))) {
      const d = new Date(datum + "T00:00:00");
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      if (Math.abs(d.getTime() - mitt) > 183 * 86400000) continue;
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
    const b: Byte = { ledig: r.startdatum, ersatter: r.ersatter_datum, ersatterNamn: rodVardagNamn(r.ersatter_datum) || "röd dag" };
    if (!ledig[b.ledig]) ledig[b.ledig] = b;
    if (!rod[b.ersatter]) rod[b.ersatter] = b;
  }
  return { ledig, rod };
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
  p: { medarbetareId: string; namn: string; datum: string; typ: FranvaroTyp },
): Promise<{ ok: true; rad: FranvaroRad } | { ok: false; fel: string }> {
  if (!FRANVARO_ANMALS.includes(p.typ)) return { ok: false, fel: `${p.typ} ansöks i Ledighet, anmäls inte här.` };
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
    })
    .select("id, medarbetare_id, typ, startdatum, slutdatum, status, ersatter_datum")
    .single();
  if (error || !data) return { ok: false, fel: error?.message || "Kunde inte spara frånvaron." };
  return { ok: true, rad: data as FranvaroRad };
}

// ── Legacy: arbetsdag.dagtyp ─────────────────────────────────
// De två gamla frånvaroraderna i arbetsdag (Martin 2026-05-10, Joacim
// 2026-08-19, båda sjuk, 0 min, ingen tid) har dagtyp kvar tills steg 3.
// Den här listan används BARA för att inte räkna sådana rader som arbetsdag/
// kortpass — aldrig för att avgöra att en dag ÄR frånvaro. Tas bort i steg 3.
export const DAGTYP_FRANVARO_LEGACY = ["sjuk", "vab", "foraldraledig", "semester", "atk"] as const;
