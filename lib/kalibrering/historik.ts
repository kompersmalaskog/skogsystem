/**
 * Kalibreringshistoriken (fakt_kalibrering_historik): vad en rad får visas som.
 *
 * En rad vars orsak är "Repair of measurement system" är en OMKALIBRERING efter reparation av mätsystemet — maskinen
 * mättes in på nytt. Dess `dia_justering_mm`/`langd_justering_mm` är inte en justering i mm: R64428:s diameterrad (56 vid
 * position 50) betyder inte "+56 mm". Databasen märker raderna (`omkalibrering`, generated column i migrationen
 * 20261023…_kalibrering_historik_rot_och_omkalibrering); den här filen är den enda vägen i appen från en rad till text.
 * En vy som visar en justering går genom `justeringsText`/`justering`, aldrig rått ur kolumnerna
 * (`historik.vakt.test.ts` larmar annars).
 */

/** Samma literal som i migrationen — `historik.test.ts` kontrollerar det. */
export const OMKALIBRERING_ORSAK = 'Repair of measurement system';

export const OMKALIBRERING_TEXT = 'Omkalibrering efter reparation';

type Rad = {
  orsak?: string | null;
  omkalibrering?: boolean | null;
  typ?: string | null;
  langd_justering_mm?: number | null;
  langd_justering_rot_mm?: number | null;
  dia_justering_mm?: number | null;
};

/** Raden är en omkalibrering. Märket i databasen går före; saknas det (migrationen ej körd) avgör orsaken. */
export function arOmkalibrering(rad: Pick<Rad, 'orsak' | 'omkalibrering'>): boolean {
  if (typeof rad.omkalibrering === 'boolean') return rad.omkalibrering;
  return (rad.orsak ?? '') === OMKALIBRERING_ORSAK;
}

export type Justering =
  | { slag: 'omkalibrering' }
  | { slag: 'justering'; mm: number | null; rotMm: number | null };

/** Vad raden är: en omkalibrering (inget mm-tal alls) eller en justering med sitt värde (null = saknas i datan). */
export function justering(rad: Rad): Justering {
  if (arOmkalibrering(rad)) return { slag: 'omkalibrering' };
  const mm = rad.typ === 'langd' ? rad.langd_justering_mm ?? null : rad.dia_justering_mm ?? null;
  return { slag: 'justering', mm, rotMm: rad.typ === 'langd' ? rad.langd_justering_rot_mm ?? null : null };
}

const tecken = (mm: number) => (mm > 0 ? `+${mm}` : String(mm).replace('-', '−'));

/** "+2 mm" · "−1 mm" · "0 mm" · "saknas i datan"; omkalibreringen skrivs som sig själv, aldrig som ett tal. */
export function justeringsText(rad: Rad): string {
  const j = justering(rad);
  if (j.slag === 'omkalibrering') return OMKALIBRERING_TEXT;
  if (j.mm == null) return 'saknas i datan';
  return j.rotMm == null ? `${tecken(j.mm)} mm` : `${tecken(j.mm)} mm · rot ${tecken(j.rotMm)} mm`;
}
