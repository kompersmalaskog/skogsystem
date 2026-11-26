// "Vad gjorde du?" visar förarens sex mest använda först och resten bakom "Fler"
// (Martin 2026-11-26). Räknas per enhet i localStorage — det är förarens egen
// telefon. Utan historik (första gången, privat läge, trasigt minne) visas alla.

import { EXTRA_ARBETE_TYPER, type AktivitetTyp } from "@/lib/aktiviteter";

export const MEST_ANVANDA_NYCKEL = "extra_arbete_mest_v1";
export const MEST_ANVANDA_ANTAL = 6;

export type Rakning = Partial<Record<AktivitetTyp, number>>;

export function lasRakning(): Rakning {
  try {
    const r = JSON.parse(localStorage.getItem(MEST_ANVANDA_NYCKEL) || "{}");
    return r && typeof r === "object" ? r : {};
  } catch { return {}; }
}

export function noteraAnvandning(typ: AktivitetTyp): void {
  try {
    const r = lasRakning();
    r[typ] = (r[typ] || 0) + 1;
    localStorage.setItem(MEST_ANVANDA_NYCKEL, JSON.stringify(r));
  } catch { /* minnet är bara en bekvämlighet */ }
}

/**
 * Vilka val som syns först. null = visa alla (ingen historik). Annars de sex
 * mest använda (lika många: appens ordning), fyllda med appens ordning om
 * föraren använt färre än sex. Ordningen är alltid appens, så knapparna inte
 * byter plats när en räkning ändras.
 */
export function forstaVal(r: Rakning): AktivitetTyp[] | null {
  const anvanda = EXTRA_ARBETE_TYPER.filter(t => (r[t] || 0) > 0);
  if (anvanda.length === 0 || EXTRA_ARBETE_TYPER.length <= MEST_ANVANDA_ANTAL) return null;
  const valda = [...anvanda].sort((a, b) => (r[b] || 0) - (r[a] || 0) || EXTRA_ARBETE_TYPER.indexOf(a) - EXTRA_ARBETE_TYPER.indexOf(b)).slice(0, MEST_ANVANDA_ANTAL);
  for (const t of EXTRA_ARBETE_TYPER) { if (valda.length >= MEST_ANVANDA_ANTAL) break; if (!valda.includes(t)) valda.push(t); }
  return EXTRA_ARBETE_TYPER.filter(t => valda.includes(t));
}
