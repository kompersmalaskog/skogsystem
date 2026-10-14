// Historikvyn (admin): förklaringen av index. Alla siffror RÄKNAS ur vy_hist_normkurva (variant 'g15-viktad'), med samma formel som
// vy_hist_objekt_index använder för forvantad_m3_per_g15:  exp(a + b · ln(medelstam)).  Inga normalvärden är hårdkodade här;
// bara vilka medelstammar som visas och exemplets faktor.

import { fmt } from "./berakna";

export type IndexAtgard = "gallring" | "slutavverkning";
export const INDEX_ATGARDER: IndexAtgard[] = ["gallring", "slutavverkning"];

/** Kurvan för en åtgärd ur vy_hist_normkurva. n = antal objekt den räknats på. */
export type Kurva = { a: number; b: number; n: number };
export type Kurvor = Partial<Record<IndexAtgard, Kurva>>;

/** Medelstammarna (m³ per stam) som tabellen visar. */
export const TABELL_MEDELSTAM: Record<IndexAtgard, number[]> = {
  gallring: [0.08, 0.12, 0.16],
  slutavverkning: [0.25, 0.4, 0.6],
};

/** Medelstammen exemplet räknas på. */
export const EXEMPEL_MEDELSTAM: Record<IndexAtgard, number> = { gallring: 0.12, slutavverkning: 0.4 };

/** "Maskinen gjorde" i exemplet = normalt × 1,1, så att exemplet alltid visar index 110. */
export const EXEMPEL_FAKTOR = 1.1;

/** Förväntat m³/G15 vid en medelstam: exakt vy_hist_objekt_index.forvantad_m3_per_g15. */
export function normalt(k: Kurva, medelstam: number): number {
  return Math.exp(k.a + k.b * Math.log(medelstam));
}

export type TabellRad = { medelstam: string; normalt: string };

/** Tabellen: medelstam | normalt m³/G15, avrundat till heltal. */
export function normaltTabell(k: Kurva, atgard: IndexAtgard): TabellRad[] {
  return TABELL_MEDELSTAM[atgard].map((ms) => ({ medelstam: fmt(ms, 2) as string, normalt: fmt(Math.round(normalt(k, ms)), 0) as string }));
}

export type Exempel = { medelstam: string; normalt: string; gjorde: string; index: string };

/**
 * Exemplet räknas på det avrundade normalvärdet som står i texten, så att talen går att kontrollräkna med miniräknare:
 * normalt N (heltal), maskinen gjorde N × 1,1 (en decimal om den behövs), index = gjorde / N × 100 = 110.
 */
export function indexExempel(k: Kurva, atgard: IndexAtgard): Exempel {
  const ms = EXEMPEL_MEDELSTAM[atgard];
  const n = Math.round(normalt(k, ms));
  const gjorde = Math.round(n * EXEMPEL_FAKTOR * 10) / 10;
  const index = Math.round((gjorde / n) * 100);
  return { medelstam: fmt(ms, 2) as string, normalt: fmt(n, 0) as string, gjorde: fmt(gjorde, Number.isInteger(gjorde) ? 0 : 1) as string, index: fmt(index, 0) as string };
}

/** Gallring eller slutavverkning, annars null (skada, special, okänd och skotare har inget index). */
export function indexAtgard(a: string | null | undefined): IndexAtgard | null {
  return a === "gallring" || a === "slutavverkning" ? a : null;
}

/** Åtgärderna bladet visar: den som gäller där man tryckte, eller båda. */
export function atgarderAtt(atgard: IndexAtgard | null | undefined): IndexAtgard[] {
  return atgard ? [atgard] : INDEX_ATGARDER;
}

/** Text för vilka objekt kurvan räknats på. Siffrorna kommer ur vyn (n), aldrig ur koden. */
export function underlagText(kurvor: Kurvor, atgarder: IndexAtgard[]): string {
  const delar = atgarder.filter((a) => kurvor[a]).map((a) => `${fmt(kurvor[a]!.n, 0)} i ${a}`);
  if (delar.length === 0) return "Räknat från våra egna objekt där åtgärden är känd.";
  return delar.length === 1 && atgarder.length === 1
    ? `Räknat från ${fmt(kurvor[atgarder[0]]!.n, 0)} av våra egna objekt i ${atgarder[0]} där åtgärden är känd.`
    : `Räknat från våra egna objekt där åtgärden är känd: ${delar.join(" och ")}.`;
}
