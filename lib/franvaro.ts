// Frånvarons taxonomi — EN lista som Arbetsrapportens morgonkort, Kalendern,
// Sammanställningen och löneberäkningen läser från.
//
// Frånvaro bor i dag på två ställen i databasen (utredning 2026-09-08):
//   - arbetsdag.dagtyp — OPLANERAD frånvaro som händer idag, skrivs av föraren
//     på morgonen och bekräftas direkt. Ingen CHECK i prod. Kolumnen betyder
//     samtidigt "sorts maskindag" (Produktion 899, normal 87) — den dubbla
//     betydelsen är känd och rörs inte här.
//   - ledighet_ansokningar.typ — PLANERAD ledighet som ansöks och godkänns
//     (semester, atk).
//
// SAMLAD MODELL (beslut 2026-09-17, docs/lonesystem/franvaromodell.md):
// ledighet_ansokningar blir den enda frånvarotabellen. Steg 1 (migration
// 20260917100000) vidgade schemat till alla typer nedan + status 'registrerad'
// + ersatter_datum (skoftning) + kalla. Steg 2: morgonkortet skriver dit.
// Steg 3: EN lib läser EN källa; dagtyp-frånvaron slutar läsas. Tills steg 3
// är kört gäller fortfarande: lön/kalender/Min tid läser BÅDA källorna.

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

/** Var raden kom ifrån. */
export type FranvaroKalla = "ansokan" | "morgonkort" | "admin" | "backfill";

/** Typer som anmäls (kan vara 'registrerad'), inte ansöks. */
export const FRANVARO_ANMALS: readonly FranvaroTyp[] = ["sjuk", "vab", "foraldraledig"];

/** Intjänad ledighet — bryter inte helglön även efter 30 dagar (§10 mom 4). */
export const FRANVARO_INTJANAD: readonly FranvaroTyp[] = ["semester", "atk", "komp"];

/** Rubrik per typ i den samlade modellen. */
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

// ── Det som gäller TILLS steg 2–3 är körda: morgonkortets tre dagtyper ──

export type FranvaroDagtyp = "sjuk" | "vab" | "foraldraledig";

export type FranvaroVal = {
  id: FranvaroDagtyp;
  /** Knapp-/listetikett. */
  label: string;
  /** Rubrik på en sådan dag ("Sjukdag — måndag 7 september"). */
  rubrik: string;
  /** Material Symbol. */
  ikon: string;
  /** Helskärmsbekräftelsen efter registrering. */
  meddelande: string;
};

/** De frånvarotyper föraren kan välja på morgonen. Ordningen är visningsordningen. */
export const FRANVARO_VAL: readonly FranvaroVal[] = [
  { id: "sjuk",          label: "Sjukfrånvaro",  rubrik: "Sjukdag",       ikon: "medical_services", meddelande: "Krya på dig!" },
  { id: "vab",           label: "VAB",           rubrik: "VAB",           ikon: "child_care",       meddelande: "VAB registrerad" },
  { id: "foraldraledig", label: "Föräldraledig", rubrik: "Föräldraledig", ikon: "family_restroom",  meddelande: "Föräldraledighet registrerad" },
] as const;

/** Underraden på frånvarokortet: man ska se vad som finns under utan att trycka. */
export const FRANVARO_UNDERRAD = FRANVARO_VAL.map((v) => v.label === "Sjukfrånvaro" ? "Sjuk" : v.label).join(", ");

export function arFranvaroDagtyp(dagtyp: string | null | undefined): dagtyp is FranvaroDagtyp {
  return !!dagtyp && FRANVARO_VAL.some((v) => v.id === dagtyp);
}

/** Rubrik för alla frånvarovärden som kan förekomma i dagtyp (inkl. äldre semester/atk). */
export const FRANVARO_RUBRIK: Record<string, string> = {
  ...Object.fromEntries(FRANVARO_VAL.map((v) => [v.id, v.rubrik])),
  semester: "Semester",
  atk: "ATK",
};

/** Alla dagtyp-värden som betyder "ingen arbetstid" — för lön, kalender och summering. */
export const FRANVARO_DAGTYPER_ALLA = ["sjuk", "vab", "foraldraledig", "semester", "atk"] as const;
