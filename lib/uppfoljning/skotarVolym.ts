// Två-volyms-modellen för skotare (egen skotning + omlastning).
//
// En skotarmaskin kan på ett objekt utföra TVÅ slags arbete:
//  • EGEN skotning — volym som RÄKNAS mot objektets skotade total.
//  • OMLASTNING    — volym som ALDRIG räknas mot totalen (visas som arbete och
//                    tillskrivs ett annat objekt via avser_objekt_id).
//
// Källa till sanning per (objekt_id + maskin_id):
//   mätt = SUM(fakt_lass.volym_m3sub) för det objektet + den maskinen.
//
// RESOLUTIONSREGELN (exakt — delas av redigering, uppföljning-detalj och listan):
//   egen       = volym_egen_skotning ?? (ar_omlastning ? 0
//                  : (volym_m3 ?? max(0, mätt − (volym_omlastning ?? 0))))
//   omlastning = volym_omlastning   ?? (ar_omlastning ? (volym_m3 ?? mätt) : 0)
//
// volym_m3 är LEGACY (deprecated) och används BARA som read-fallback när de nya
// kolumnerna är NULL. GROT-markörer (maskin_id NULL) hanteras aldrig här — de
// filtreras bort redan i hämtningen.

export interface SkotareManuellRad {
  volym_egen_skotning?: number | null;
  volym_omlastning?: number | null;
  volym_m3?: number | null;
  ar_omlastning?: boolean | null;
}

export interface SkotareVolym {
  egen: number;        // räknas mot skotad total
  omlastning: number;  // räknas ALDRIG mot skotad total
}

const numOrNull = (v: unknown): number | null =>
  v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Löser en skotarmaskins effektiva volymer på ett objekt enligt regeln ovan.
 * @param rad  människo-ägd rad ur skotare_objekt_manuell (eller null = ingen rad)
 * @param matt SUM(fakt_lass.volym_m3sub) för samma objekt + maskin
 */
export function resolveSkotareVolym(rad: SkotareManuellRad | null | undefined, matt: number): SkotareVolym {
  const egenCol = numOrNull(rad?.volym_egen_skotning);
  const omlCol = numOrNull(rad?.volym_omlastning);
  const legacy = numOrNull(rad?.volym_m3);
  const arOml = !!rad?.ar_omlastning;

  const omlastning = omlCol != null
    ? omlCol
    : (arOml ? (legacy != null ? legacy : matt) : 0);

  const egen = egenCol != null
    ? egenCol
    : (arOml ? 0 : (legacy != null ? legacy : Math.max(0, matt - (omlCol ?? 0))));

  return { egen, omlastning };
}
