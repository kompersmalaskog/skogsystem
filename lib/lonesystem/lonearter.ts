// Lönearter som appen skickar till Fortnox — etikett + ENHET per kod. Appen
// skickar MÄNGDER (timmar, veckor, påbörjade mil); Fortnox äger satserna.
// Delas av förarens tidsspecifikation (skärm + PDF). Koderna sätts i
// lib/lonesystem/loneberakning.ts — läggs en ny till där ska den in här.
export const LONEARTER: Record<string, { label: string; enhet: string }> = {
  "11":   { label: "Timlön",              enhet: "tim" },
  "1355": { label: "Premielön skördare",  enhet: "tim" },
  "1354": { label: "Premielön skotare",   enhet: "tim" },
  "1435": { label: "Övertid skördare",    enhet: "tim" },
  "1436": { label: "Övertid skotare",     enhet: "tim" },
  "136":  { label: "Vältlappar",          enhet: "veckor" },
  "821":  { label: "Reseersättning",      enhet: "påbörjade mil" },
};

export function loneartLabel(kod: string): string { return LONEARTER[kod]?.label ?? `Löneart ${kod}`; }
export function loneartEnhet(kod: string): string { return LONEARTER[kod]?.enhet ?? ""; }

/** "112.00" → "112", "14.97" → "14,97" — svenskt decimalkomma, inga döda nollor. */
export function fmtMangd(n: string | number): string {
  const v = typeof n === "number" ? n : parseFloat(n);
  if (!Number.isFinite(v)) return String(n);
  return (Math.round(v * 100) / 100).toString().replace(".", ",");
}
