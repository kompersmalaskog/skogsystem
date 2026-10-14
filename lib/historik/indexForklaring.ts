// Historikvyn (admin): förklaringen av index. Alla siffror RÄKNAS ur vy_hist_normkurva (variant 'g15-viktad'), med samma formel som
// vy_hist_objekt_index använder för forvantad_m3_per_g15:  exp(a + b · ln(medelstam)).  Inga normalvärden är hårdkodade här;
// bara vilka medelstammar som visas och exemplets faktor.

import { fmt } from "./berakna";
import type { MaskinArRad } from "./typer";

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

/** "Maskinen gjorde" i exemplet = normalt × 1,1, avrundat till heltal. */
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
 * Exemplet räknas på de avrundade heltal som står i texten, så att det går att kontrollräkna med miniräknare:
 * normalt N, maskinen gjorde avrundat(N × 1,1), index = avrundat(gjorde / N × 100). Inga decimaler (27 → 30 → 111).
 */
export function indexExempel(k: Kurva, atgard: IndexAtgard): Exempel {
  const ms = EXEMPEL_MEDELSTAM[atgard];
  const n = Math.round(normalt(k, ms));
  const gjorde = Math.round(n * EXEMPEL_FAKTOR);
  const index = Math.round((gjorde / n) * 100);
  return { medelstam: fmt(ms, 2) as string, normalt: fmt(n, 0) as string, gjorde: fmt(gjorde, 0) as string, index: fmt(index, 0) as string };
}

/** Gallring eller slutavverkning, annars null (skada, special, okänd och skotare har inget index). */
export function indexAtgard(a: string | null | undefined): IndexAtgard | null {
  return a === "gallring" || a === "slutavverkning" ? a : null;
}

/** Åtgärderna bladet visar: den som gäller där man tryckte, eller båda. */
export function atgarderAtt(atgard: IndexAtgard | null | undefined): IndexAtgard[] {
  return atgard ? [atgard] : INDEX_ATGARDER;
}

/** Skotare och index: EN formulering, i bladet och överallt i appen där det sägs. */
export const SKOTARE_UTAN_INDEX = "Skotare får inget index. Det som styr en skotare är skotningsavståndet, och det finns inte i rapporterna.";

/**
 * Åren kurvan är räknad på, ur vy_hist_maskin_ar: åren som har objekt med index (urval 'namn', skördare). Räkningen kontrolleras mot
 * kurvans egna n (summan av antal_med_index per år måste vara exakt n), annars visas inga år: hellre inget år än ett som inte hör till kurvan.
 */
export function underlagAr(rader: MaskinArRad[] | undefined, atgard: IndexAtgard, n: number): { fran: number; till: number } | null {
  if (!rader) return null;
  let summa = 0, fran = Infinity, till = -Infinity;
  for (const r of rader) {
    if (r.typ !== "skördare" || r.urval !== "namn" || r.atgard !== atgard || r.ar === null || r.antal_med_index <= 0) continue;
    summa += r.antal_med_index;
    fran = Math.min(fran, r.ar);
    till = Math.max(till, r.ar);
  }
  return summa === n && Number.isFinite(fran) ? { fran, till } : null;
}

const PLURAL: Record<IndexAtgard, { en: string; flera: string }> = {
  gallring: { en: "gallring", flera: "gallringar" },
  slutavverkning: { en: "slutavverkning", flera: "slutavverkningar" },
};

/** "Räknat från 896 egna slutavverkningar 2012–2026." Antal ur vy_hist_normkurva (n), år ur vy_hist_maskin_ar; inget är hårdkodat. */
export function underlagText(kurvor: Kurvor, atgarder: IndexAtgard[], rader?: MaskinArRad[]): string {
  const delar = atgarder.filter((a) => kurvor[a]).map((a) => {
    const n = kurvor[a]!.n;
    const ar = underlagAr(rader, a, n);
    return `${fmt(n, 0)} ${n === 1 ? `egen ${PLURAL[a].en}` : `egna ${PLURAL[a].flera}`}${ar ? ` ${ar.fran}–${ar.till}` : ""}`;
  });
  return delar.length === 0 ? "Räknat från våra egna objekt." : `Räknat från ${delar.join(" och ")}.`;
}
