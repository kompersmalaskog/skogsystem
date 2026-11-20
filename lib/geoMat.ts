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
  if (meters >= 1000) return `${(meters / 1000).toFixed(2).replace('.', ',')} km`;   // decimalkomma, som "0,89 ha" (före 2026-10-07: punkt)
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

// ── Figuren i körvyns Mät/Rita: etikett i själva figuren ───────────────────────────────────────────────────────────────

export interface FigurEtikett {
  /** Var etiketten ligger på kartan ([lng, lat]). */
  punkt: LngLat;
  /** "0,89 ha" (yta) eller "384 m" (linje). */
  text: string;
}

/** Punkten halvvägs längs linjen (mätt i meter, inte i antal punkter). */
export function linjeMitt(punkter: readonly LngLat[]): LngLat | null {
  if (!punkter || punkter.length === 0) return null;
  if (punkter.length === 1) return punkter[0];
  const total = pathMeters(punkter as LngLat[]);
  if (!(total > 0)) return punkter[0];
  let kvar = total / 2;
  for (let i = 1; i < punkter.length; i++) {
    const d = metersBetween(punkter[i - 1], punkter[i]);
    if (kvar <= d && d > 0) {
      const t = kvar / d;
      return [punkter[i - 1][0] + (punkter[i][0] - punkter[i - 1][0]) * t, punkter[i - 1][1] + (punkter[i][1] - punkter[i - 1][1]) * t];
    }
    kvar -= d;
  }
  return punkter[punkter.length - 1];
}

/** Mittpunkten av hörnen (räcker för en etikett; ytan är liten och ofta konvex). */
export function hornMitt(punkter: readonly LngLat[]): LngLat | null {
  if (!punkter || punkter.length === 0) return null;
  let x = 0, y = 0;
  for (const p of punkter) { x += p[0]; y += p[1]; }
  return [x / punkter.length, y / punkter.length];
}

/**
 * Etiketten som sitter i figuren medan den ritas: area mitt i en yta (från 3 hörn), längd mitt på en linje (från 2 punkter).
 * Färre punkter än så → null (ingen etikett förrän det finns något att mäta).
 */
export function figurEtikett(punkter: readonly LngLat[], yta: boolean): FigurEtikett | null {
  if (yta) {
    if (!punkter || punkter.length < 3) return null;
    const punkt = hornMitt(punkter);
    return punkt ? { punkt, text: formatHa(ringAreaM2(punkter as LngLat[])) } : null;
  }
  if (!punkter || punkter.length < 2) return null;
  const punkt = linjeMitt(punkter);
  return punkt ? { punkt, text: formatLength(pathMeters(punkter as LngLat[])) } : null;
}
