// Medelstam ur traktdirektivets text (m³fub per stam). EN källa: parsern i td-parser.ts, importen och engångskörningen scripts/medelstam-ur-td.ts använder den här.
//
// ÄRLIGHET: tolkningen är KONSERVATIV. Den godtar bara ett tal som står direkt efter ordet "Medelstam" (etikett + värde, ev. med enhet emellan), i ett rimligt
// intervall, och bara när texten bär EXAKT ett sådant värde. Allt annat — ingen träff, flera olika värden, ett värde utanför intervallet — ger null; ingen gissning, och
// ett tal som tolkas om skrivs inte över ett som redan står (det avgörs av anroparen: importen fyller bara ett tomt fält). Ambiguitet ger en varning med råtexten.
//
// OBS: skriven utan tillgång till en riktig TD-utläsning av medelstam-raden (bara sidhuvud och Arbetsform är verifierade mot riktig fil, se __fixtures__/td-text.ts).
// Engångskörningen skriver därför ut vad den hittat per objekt i dry-run innan något sparas.

export interface MedelstamSvar {
  medelstam: number | null;
  /** Bara när texten hade en träff som inte gick att avgöra (flera olika värden) — med råtexten. */
  varning: string | null;
}

const MIN = 0.01;
const MAX = 3;

export function tolkaMedelstam(text: string): MedelstamSvar {
  const re = /Medelstam(?:men)?\s*(?:\(\s*m[³3]\s*(?:fub|sub)\s*\)|m[³3]\s*(?:fub|sub))?\s*[:=]?\s*(\d{1,2}(?:[.,]\d{1,3})?)(?![\d,.]*\d)/gi;
  const traffar: Array<{ rad: string; varde: number }> = [];
  for (const m of Array.from(text.matchAll(re))) {
    const v = Number(m[1].replace(',', '.'));
    if (Number.isFinite(v) && v >= MIN && v <= MAX) traffar.push({ rad: m[0].replace(/\s+/g, ' ').trim(), varde: v });
  }
  if (traffar.length === 0) return { medelstam: null, varning: null };
  const unika = Array.from(new Set(traffar.map((t) => t.varde)));
  if (unika.length > 1) {
    return { medelstam: null, varning: `Medelstam ur traktdirektivet kunde inte avgöras — flera olika värden i texten: ${traffar.map((t) => `"${t.rad}"`).join(', ')}. Fältet lämnades tomt.` };
  }
  return { medelstam: unika[0], varning: null };
}
