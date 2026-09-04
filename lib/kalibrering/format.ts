/**
 * TALFORMAT I KALIBRERINGSVYN — komma som decimaltecken, överallt.
 *
 * Svenska. Tidigare stod "+0.6 mm" och "4.0 mm" i korten men "5,5 m" i
 * stam-modalen. Varje tal med decimaler ska gå genom `dec` — aldrig
 * `toFixed` direkt i en vy.
 */

/** n med `decimaler` decimaler och komma: dec(4.02, 1) → "4,0". */
export const dec = (n: number, decimaler: number): string =>
  n.toFixed(decimaler).replace('.', ',');

/**
 * Avvikelse med tecken. cm alltid 1 decimal (+0,3 / −1,5), mm alltid heltal
 * (+2 / −1). null/undefined/NaN → "–".
 */
export const fmtAvvikelse = (n: number | null | undefined, unit: 'cm' | 'mm'): string => {
  if (n == null || isNaN(n)) return '–';
  const sign = n > 0 ? '+' : '';
  if (unit === 'cm') return `${sign}${dec(n, 1)}`;
  return `${sign}${Math.round(n)}`;
};

/** Osignerat mätvärde (toleransfönster o.d.): cm 1 decimal, mm heltal. */
export const fmtTal = (n: number | null | undefined, unit: 'cm' | 'mm'): string => {
  if (n == null || isNaN(n)) return '–';
  return unit === 'cm' ? dec(n, 1) : String(Math.round(n));
};

/**
 * Kravtröskel med minimala decimaler (4 → "4", 1.5 → "1,5"). Heltalsavrundning
 * skulle dölja att VIDA:s systematik-golv är 1,5 (inte 2) och std-mål 3,5.
 */
export const fmtKrav = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return '–';
  return Number.isInteger(n) ? String(n) : dec(n, 1);
};

/** Signerat värde med 1 decimal: systematisk avvikelse (+0,6 / −0,7). */
export const fmtSig1 = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return '–';
  return `${n > 0 ? '+' : ''}${dec(n, 1)}`;
};

/** Osignerat värde med 1 decimal: standardavvikelse (4,0). */
export const fmtAbs1 = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return '–';
  return dec(n, 1);
};
