// Små geometrihjälpare för skotarläget. Allt i meter, lokal plan projektion (räcker på en trakt).
import { haversineMeters } from '../gps-guard';
import type { LatLng } from './typer';

export const avstand = (a: LatLng, b: LatLng): number => haversineMeters(a.lat, a.lng, b.lat, b.lng);

/** Meter nord/öst om `origo` — plan approximation, fel < 0,1 % inom några km. */
export function tillPlan(p: LatLng, origo: LatLng): { x: number; y: number } {
  const mPerGradLat = 111320;
  const mPerGradLng = 111320 * Math.cos((origo.lat * Math.PI) / 180);
  return { x: (p.lng - origo.lng) * mPerGradLng, y: (p.lat - origo.lat) * mPerGradLat };
}

/** Kortaste avståndet från punkt `p` till sträckan a–b, i meter. */
export function avstandTillStracka(p: LatLng, a: LatLng, b: LatLng): number {
  const pp = tillPlan(p, a), bb = tillPlan(b, a);
  const len2 = bb.x * bb.x + bb.y * bb.y;
  if (len2 < 1e-9) return Math.hypot(pp.x, pp.y);
  const t = Math.max(0, Math.min(1, (pp.x * bb.x + pp.y * bb.y) / len2));
  return Math.hypot(pp.x - t * bb.x, pp.y - t * bb.y);
}

/** Närmaste avstånd till en linje (punktlista). Tom linje → Infinity. */
export function avstandTillLinje(p: LatLng, linje: readonly LatLng[]): number {
  if (linje.length === 0) return Infinity;
  if (linje.length === 1) return avstand(p, linje[0]);
  let min = Infinity;
  for (let i = 1; i < linje.length; i++) min = Math.min(min, avstandTillStracka(p, linje[i - 1], linje[i]));
  return min;
}
