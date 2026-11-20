// Vilket område skogen ritas för (bakgrunden Ritad). EN regel, i den här ordningen (Martin 2026-10-31: "här hemma funkar det inte"):
//   1. Vidas traktgräns (L_TRAKTDEL) — finns den gäller den.
//   2. Traktgränsen planeraren ritat själv (privata jobb, väntar på Vida).
//   3. Ingen gräns alls: en ruta 1 × 1 km runt objektets punkt. Raden under Ritad säger det.
// Ingen punkt och ingen gräns → inget område (bara vägar och vatten; raden säger varför). Aldrig en gissad plats.

export type Ring = [number, number][];
export type OmradesKalla = 'vida' | 'egen' | 'punkt';
export type Omrade = { kalla: OmradesKalla; ringar: Ring[] };

/** Halva sidan på rutan runt objektets punkt, i meter. */
export const PUNKT_HALV_M = 500;

const giltigRing = (r: unknown): r is Ring =>
  Array.isArray(r) && r.length > 2 && r.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => Number.isFinite(v)));

/** Ruta runt en punkt, [lng, lat], sluten. */
export function rutaRunt(lat: number, lng: number, halvM = PUNKT_HALV_M): Ring {
  const dLat = halvM / 111_320;
  const dLng = halvM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [
    [lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat],
  ];
}

export function valjOmrade({ vida, egna, punkt }: {
  vida: Ring[] | null | undefined;
  egna: Ring[] | null | undefined;
  punkt: { lat: number; lng: number } | null | undefined;
}): Omrade | null {
  const v = (vida ?? []).filter(giltigRing);
  if (v.length) return { kalla: 'vida', ringar: v };
  const e = (egna ?? []).filter(giltigRing);
  if (e.length) return { kalla: 'egen', ringar: e };
  if (punkt && Number.isFinite(punkt.lat) && Number.isFinite(punkt.lng) && !(punkt.lat === 0 && punkt.lng === 0)) {
    return { kalla: 'punkt', ringar: [rutaRunt(punkt.lat, punkt.lng)] };
  }
  return null;
}

/** Nyckel för cachen: samma område (avrundat ~1 m) = samma laserdata. */
export const omradeNyckel = (o: Omrade) =>
  o.kalla + ':' + o.ringar.map((r) => r.map(([x, y]) => `${x.toFixed(5)},${y.toFixed(5)}`).join(';')).join('|');
