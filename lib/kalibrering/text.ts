/**
 * SMÅ TEXTHJÄLPARE FÖR KALIBRERINGSVYN — flyttade ur app/kalibrering/page.tsx, oförändrade.
 * Talformat (komma som decimaltecken) bor i ./format; ord och namn i ./ordlista.
 */

/** "GRAN" → "Gran". */
export const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

/** Pluralis: 1 = singular, 2+ = plural. "1 stock" / "2 stockar". */
export const antalText = (n: number, singular: string, plural: string) =>
  `${n} ${n === 1 ? singular : plural}`;
export const stockText = (n: number) => antalText(n, 'stock', 'stockar');
export const stamText = (n: number) => antalText(n, 'stam', 'stammar');

/** Kontrollens status i klartext ("VARNING" → "Varning"). */
export const kontrollStatusText = (s: string) => {
  if (s === 'OK') return 'OK';
  if (s === 'VARNING') return 'Varning';
  if (s === 'FEL') return 'Fel';
  return s;
};

/** "21 okt. 2026"-formen i kontrollarkets undertitel. */
export const kortDatum = (iso: string) =>
  new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
