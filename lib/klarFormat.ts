// Små formateringshjälpare för "Klar med trakten?" — svenskt format (decimalkomma, tusentalsmellanrum), inget annat.

/** "17/10" — dag/månad, som Stämmer-knappen visar det. */
export const dagManad = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()}/${d.getMonth() + 1}`;
};

/** "15 okt" — när en Har du-fråga besvarades. */
export const datum = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
};

/** Texten i ett fält → tal (komma eller punkt). null = tomt eller inget tal. */
export const tal = (t: string): number | null => {
  const n = Number(t.replace(/\s/g, '').replace(',', '.'));
  return t.trim() !== '' && Number.isFinite(n) ? n : null;
};

/** 1734 → "1 734" (tusentalsavgränsare, som resten av appen). */
export const sv = (n: number): string => n.toLocaleString('sv-SE', { maximumFractionDigits: 1 });

/** Svensk decimalkomma i ett skrivfält ("2.75" → "2,75"); det som skrivs tolkas av parseSvNum, så båda tecknen fungerar. */
export const komma = (t: string): string => t.replace('.', ',');

/** m³fub per G15-timme som heltal ("38") — en decimal under 10 ("4,6"), som gallringens låga tal kräver. */
export function fmtPrestation(v: number): string {
  return (v < 10 ? v.toFixed(1) : String(Math.round(v))).replace('.', ',');
}
