// Medelstam ur traktdirektivets text (m³fub per stam). EN källa: parsern i td-parser.ts, importen och engångskörningen scripts/medelstam-ur-td.ts använder den här.
//
// ÄRLIGHET: tolkningen är KONSERVATIV. Den godtar bara ett tal som står direkt efter ordet "Medelstam" (etikett + värde, ev. med enhet emellan), i ett rimligt
// intervall, och bara när texten bär EXAKT ett sådant värde. Allt annat — ingen träff, flera olika värden, ett värde utanför intervallet — ger null; ingen gissning, och
// ett tal som tolkas om skrivs inte över ett som redan står (det avgörs av anroparen: importen fyller bara ett tomt fält). Ambiguitet ger en varning med råtexten.
//
// VIDAS TABELL (verifierad mot riktig fil 2026-11-05, Lidhem rp 2025 Britteberg, traktnr 885871): medelstam är en KOLUMN i traktdelstabellen, inte "Medelstam: 0,48".
// Efter unpdf: "Traktdel-id Areal, ha TGL Fföträd/ha Medelstam Uttag m3fub 62E7J8333 4,9 0X0 0,48 632 Total 4,9 0,48 632 Anteckningar: …".
// Etikettregeln ovan hittar då ingenting (efter ordet kommer "Uttag"), så de flesta trakter fick ingen medelstam. Tabellregeln (`medelstamUrTabell`) läser TOTAL-raden:
// talen efter "Total" fram till nästa ord; uttaget är ett heltal, areal och medelstam har decimalkomma — medelstam = det SISTA decimaltalet, och det måste finnas minst
// två (areal + medelstam), annars kunde arealen tas för medelstam när kolumnen är tom. Total-raden är traktens viktade medelstam även när den har flera traktdelar.

export interface MedelstamSvar {
  medelstam: number | null;
  /** Bara när texten hade en träff som inte gick att avgöra (flera olika värden) — med råtexten. */
  varning: string | null;
}

const MIN = 0.01;
const MAX = 3;

/** Vidas traktdelstabell: medelstam ur Total-raden (se ovan). null = tabellen finns inte eller raden går inte att avgöra. */
export function medelstamUrTabell(text: string): number | null {
  const m = /Medelstam\s+Uttag\s*m[³3]\s*fub\b[\s\S]*?\bTotal\b((?:\s+\d[\d,.]*)+)/i.exec(text);
  if (!m) return null;
  const tal = m[1].trim().split(/\s+/);
  const decimal = tal.filter((t) => /^\d+,\d+$/.test(t));
  if (decimal.length < 2) return null;
  const v = Number(decimal[decimal.length - 1].replace(',', '.'));
  return Number.isFinite(v) && v >= MIN && v <= MAX ? v : null;
}

export function tolkaMedelstam(text: string): MedelstamSvar {
  const ursvar = tolkaEtikett(text);
  if (ursvar.medelstam != null || ursvar.varning) return ursvar;
  const tabell = medelstamUrTabell(text);
  return { medelstam: tabell, varning: null };
}

function tolkaEtikett(text: string): MedelstamSvar {
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
