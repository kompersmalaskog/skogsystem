/**
 * DATUMHJÄLPARE FÖR KALIBRERINGSVYN — flyttade ur app/kalibrering/page.tsx, oförändrade.
 * Svensk text; "idag" läses ur datorns klocka (vyn visar kalenderdagar, inte ögonblick).
 */

const padNum = (n: number) => String(n).padStart(2, '0');

/** "2026-10" för innevarande månad. */
export const idagManad = () => { const d = new Date(); return `${d.getFullYear()}-${padNum(d.getMonth() + 1)}`; };
/** "2026-10-21" för idag. */
export const idagStr = () => { const d = new Date(); return `${d.getFullYear()}-${padNum(d.getMonth() + 1)}-${padNum(d.getDate())}`; };

/** "2026-10" → "Oktober 2026". */
export const manadNamn = (manad: string) => {
  const [y, m] = manad.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Månaden `delta` steg bort ("2026-10", -1 → "2026-09"). */
export const stegManad = (manad: string, delta: number) => {
  const [y, m] = manad.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${padNum(d.getMonth() + 1)}`;
};

/** "2026-10-20" → "Tisdag 20 oktober". */
export const dagrubrik = (datum: string) => {
  const d = new Date(datum + 'T00:00:00');
  const s = d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** "2026-08-26…" → "26 aug". */
export const fmtDagMan = (iso: string): string =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', '');
