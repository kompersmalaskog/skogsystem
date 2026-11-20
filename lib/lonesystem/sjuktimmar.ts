/**
 * SJUKTIMMAR — beslut Martin 2026-10-25: 8 timmar per sjuk vardag.
 *
 *   heldag sjuk   → 8 tim, bara måndag–fredag som inte är röd dag (en sjuk lördag eller juldag ger inget: det är ingen arbetsdag)
 *   deldag sjuk   → dagens frånvarotimmar = 8 minus det som arbetats (samma tal som drar av månadens ordinarie, lib/franvaro.deldagTimmar)
 *
 * Indata är det lönemotorn redan räknat: heldagarna efter "arbete vinner" (en sjukrad på en dag med pass är arbete) och deldagarna.
 * Appen skickar bara ANTALET timmar; karensavdrag och sjuklönens procent räknas i Fortnox på lönearten som kopplas till `sjuktimmar`.
 * Ren funktion, inga sidoeffekter. Minuter/timmar med två decimaler först i summan.
 */

export const SJUK_TIMMAR_PER_DAG = 8;

export type SjukDag = {
  datum: string;
  timmar: number;
  /** Deldag: föraren arbetade en del av dagen. */
  del: boolean;
};

export type Sjuktimmar = { dagar: SjukDag[]; timmar: number };

const arVardag = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`).getDay();
  return d >= 1 && d <= 5;
};

export function raknaSjuktimmar(i: {
  /** Heldagar med typ sjuk i arbetsmånaden, efter "arbete vinner". */
  heldagar: string[];
  /** Deldagar (alla typer); bara typ sjuk räknas. */
  deldagar: { datum: string; typ: string; timmar: number }[];
  /** Röda dagar i arbetsmånaden (avtalets lista). */
  rodaDagar: Iterable<string>;
}): Sjuktimmar {
  const roda = new Set(i.rodaDagar);
  const per = new Map<string, SjukDag>();
  const raknas = (iso: string) => arVardag(iso) && !roda.has(iso);
  for (const iso of i.heldagar) {
    if (raknas(iso) && !per.has(iso)) per.set(iso, { datum: iso, timmar: SJUK_TIMMAR_PER_DAG, del: false });
  }
  for (const dd of i.deldagar) {
    if (String(dd.typ).toLowerCase() !== "sjuk" || !raknas(dd.datum) || per.has(dd.datum)) continue;
    const t = Math.max(0, Math.min(SJUK_TIMMAR_PER_DAG, Number(dd.timmar) || 0));
    if (t > 0) per.set(dd.datum, { datum: dd.datum, timmar: t, del: true });
  }
  const dagar = Array.from(per.values()).sort((a, b) => a.datum.localeCompare(b.datum));
  const timmar = Math.round(dagar.reduce((s, d) => s + d.timmar, 0) * 100) / 100;
  return { dagar, timmar };
}
