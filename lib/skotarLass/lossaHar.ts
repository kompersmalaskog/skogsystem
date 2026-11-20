// "Lossa här" och avläggen den skapar (Martin 2026-10-20, efter Max: ett privat jobb utan avlägg).
//
// Max lossar på VÄGEN och landningen är ett ca 100 m långt stråk. Ett avlägg som hamnar mitt på stråket ger 5 av 5 lossningar, ett avlägg vid kanten 2 av 5
// eller en falsk träff vid lunchen (fixtur ljuvadal_wisent_2026-10-20.json). Därför:
//   • ett avlägg som skapas med "Lossa här" läggs MITT PÅ STOPPET (medelvärdet av de senaste fixarna medan maskinen stått still), inte där fingret råkade vara;
//   • efter några bekräftade lass flyttas det mot SNITTET av lossningarna — BARA avlägg som skapats via Lossa här. Vidas och planerarens avlägg, och de som
//     föraren satt för hand, flyttas aldrig (viaLossaHar märks på markeringen).
import { avstand } from './geo';
import type { Avlagg, Lass, LatLng } from './typer';

export const LOSSA_HAR = {
  /** Stoppets mitt = medelvärdet av fixarna under så här lång tid före trycket… */
  STOPP_FONSTER_S: 60,
  /** …om de ligger inom så här stor ruta (annars rör sig maskinen och senaste fixen gäller). */
  STOPP_MAX_UTBREDNING_M: 25,
  /** Så här många bekräftade lass vid avlägget krävs innan det flyttas mot snittet. */
  MIN_LASS_FOR_FLYTT: 3,
  /** Flytta bara om snittet ligger minst så här långt från avläggets läge (annars flyttar sig markeringen för varje lass). */
  MIN_FLYTT_M: 8,
} as const;

export interface TidsFix extends LatLng { ts: number }

/** Mitten på stoppet: medelvärdet av fixarna de senaste STOPP_FONSTER_S sekunderna om maskinen stått still, annars `fallback` (senaste fixen). */
export function stoppMitt(fixar: readonly TidsFix[], nu: number, fallback: LatLng): LatLng {
  const nyligen = fixar.filter((f) => nu - f.ts <= LOSSA_HAR.STOPP_FONSTER_S * 1000 && nu - f.ts >= 0);
  if (nyligen.length < 3) return fallback;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const f of nyligen) { minLat = Math.min(minLat, f.lat); maxLat = Math.max(maxLat, f.lat); minLng = Math.min(minLng, f.lng); maxLng = Math.max(maxLng, f.lng); }
  if (avstand({ lat: minLat, lng: minLng }, { lat: maxLat, lng: maxLng }) > LOSSA_HAR.STOPP_MAX_UTBREDNING_M) return fallback;
  return { lat: nyligen.reduce((s, f) => s + f.lat, 0) / nyligen.length, lng: nyligen.reduce((s, f) => s + f.lng, 0) / nyligen.length };
}

export interface AvlaggFlytt { lat: number; lng: number; antal: number }

/**
 * Ska avlägget flyttas mot snittet av lossningarna? Bara ett eget avlägg som skapats via Lossa här, med minst MIN_LASS_FOR_FLYTT BEKRÄFTADE delar vid det
 * (ett obekräftat eller struket lass är inget facit på var han lossar), och bara när snittet ligger minst MIN_FLYTT_M från där avlägget står.
 */
export function avlaggFlytt(a: Pick<Avlagg, 'id' | 'kalla' | 'lat' | 'lng' | 'viaLossaHar'>, lass: readonly Lass[]): AvlaggFlytt | null {
  if (a.kalla !== 'egen' || !a.viaLossaHar) return null;
  const delar = lass.filter((l) => l.status === 'bekraftat').flatMap((l) => l.delar).filter((d) => d.avlaggId === a.id && Number.isFinite(d.lat) && Number.isFinite(d.lng));
  if (delar.length < LOSSA_HAR.MIN_LASS_FOR_FLYTT) return null;
  const lat = delar.reduce((s, d) => s + d.lat, 0) / delar.length;
  const lng = delar.reduce((s, d) => s + d.lng, 0) / delar.length;
  if (avstand({ lat, lng }, a) < LOSSA_HAR.MIN_FLYTT_M) return null;
  return { lat, lng, antal: delar.length };
}
