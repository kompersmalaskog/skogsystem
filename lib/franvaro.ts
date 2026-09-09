// Frånvarons taxonomi — EN lista som Arbetsrapportens morgonkort, Kalendern,
// Sammanställningen och löneberäkningen läser från.
//
// Frånvaro bor på två ställen i databasen (utredning 2026-09-08, beslut om
// städning väntar):
//   - arbetsdag.dagtyp — OPLANERAD frånvaro som händer idag, skrivs av föraren
//     på morgonen och bekräftas direkt. Ingen CHECK i prod. Kolumnen betyder
//     samtidigt "sorts maskindag" (Produktion 899, normal 87) — den dubbla
//     betydelsen är känd och rörs inte här.
//   - ledighet_ansokningar.typ — PLANERAD ledighet som ansöks och godkänns
//     (semester, atk; CHECK-constraint 20260716).
//
// Föräldraledig läggs som tredje dagtyp (minsta ändring som fungerar nu):
// ingen migration, samma flöde som sjuk/vab, och den framtida städningen kan
// ta med värdet i en CHECK när dagtyp delas i två kolumner.

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
