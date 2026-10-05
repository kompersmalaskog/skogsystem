// Geo-mätning i riktiga meter/hektar (WGS84-sfär), inte skärmpixlar — se minnet "Mätverktyget geo". EN källa för
// planeringsvyns mätverktyg OCH körvyns "Mät sträcka / Mät yta / Mät genom att köra", så att båda ger samma tal för samma punkter.
//
// Formlerna är flyttade oförändrade ur app/planering/page.tsx (metersBetween / pathMeters / ringAreaM2 / formatLength / formatArea).
// geoMat.test.ts låser dem mot kända mått (100×100 m ≈ 1 ha, 1×1 km ≈ 100 ha) så en senare ändring inte kan smyga sig in.

export type LngLat = [number, number];

/** Haversine-avstånd i meter mellan två [lng,lat]. */
export function metersBetween(a: LngLat, b: LngLat): number {
  const R = 6371008.8; // medelradie, m
  const rad = (d: number) => d * Math.PI / 180;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Längd i meter längs en linje. */
export function pathMeters(coords: LngLat[]): number {
  if (!coords || coords.length < 2) return 0;
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += metersBetween(coords[i - 1], coords[i]);
  return m;
}

/** Sfärisk polygon-area i m² (samma formel som @turf/area). Ringen sluts implicit. */
export function ringAreaM2(coords: LngLat[]): number {
  if (!coords || coords.length < 3) return 0;
  const R = 6378137; // WGS84 ekvatorradie, m
  const rad = (d: number) => d * Math.PI / 180;
  let total = 0;
  for (let i = 0; i < coords.length; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[(i + 1) % coords.length];
    total += rad(lng2 - lng1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs(total * R * R / 2);
}

/** m eller km (2 decimaler från 1 km). */
export function formatLength(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

/** m² eller ha (2 decimaler från 1 ha). */
export function formatArea(sqMeters: number): string {
  if (sqMeters >= 10000) return `${(sqMeters / 10000).toFixed(2)} ha`;
  return `${Math.round(sqMeters)} m²`;
}

/** Körvyns "ha live": alltid hektar med två decimaler och svenskt decimalkomma (0,31 ha); under 0,01 ha (100 m²) visas m². */
export function formatHa(sqMeters: number): string {
  if (!(sqMeters >= 100)) return `${Math.round(Math.max(0, sqMeters) || 0)} m²`;
  return `${(sqMeters / 10000).toFixed(2).replace('.', ',')} ha`;
}

// ── Mät genom att köra (start/stopp) ────────────────────────────────────────────────────────────────────────────────────

/** Minsta förflyttning (m) innan en ny GPS-punkt läggs till — filtrerar bort stillastående jitter. */
export const KOR_MIN_STEG_M = 3;
/** Slingan räknas som sluten (och ger också en yta) när slutet ligger inom så här många meter från starten. */
export const KOR_SLUTEN_M = 25;

/** Lägg till en GPS-punkt i en körd mätning. Samma lista tillbaka om maskinen inte rört sig ≥ minStegM (inget brus). */
export function laggTillKorPunkt(punkter: readonly LngLat[], lng: number, lat: number, minStegM: number = KOR_MIN_STEG_M): LngLat[] {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return punkter as LngLat[];
  const ny: LngLat = [lng, lat];
  const sista = punkter[punkter.length - 1];
  if (sista && metersBetween(sista, ny) < minStegM) return punkter as LngLat[];
  return [...punkter, ny];
}

export interface KorResultat {
  meter: number;
  /** Bara när slingan är sluten (slutet inom KOR_SLUTEN_M från starten, minst 3 punkter) — annars null. */
  yta: number | null;
}

export function korResultat(punkter: readonly LngLat[]): KorResultat {
  const p = punkter as LngLat[];
  const meter = pathMeters(p);
  const sluten = p.length >= 3 && metersBetween(p[0], p[p.length - 1]) <= KOR_SLUTEN_M;
  return { meter, yta: sluten ? ringAreaM2(p) : null };
}
