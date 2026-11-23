// Körvyns grundzoom — förarens egen zoom, sparad per maskin (Martin 2026-11-23).
//
// Förut kunde föraren zooma ut i körvyn, men Centrera gick tillbaka till standardzoomen (KORVY_BASE_ZOOM) och följet satte om zoomen
// på varje GPS-tick. Nu:
//   1. All zoom och allt drag i körvyn är tillfälligt. Nyp, hjul och drag pausar följet; Centrera-knappen dyker upp.
//   2. Tryck på Centrera → tillbaka till maskinen med den SPARADE zoomen.
//   3. Håll in Centrera (ZOOM_HALL_MS) → valet "Spara den här zoomen". Trycker man på det blir aktuell zoom den nya grundzoomen och
//      kartan centreras. Tryck utanför → ingenting sparas.
//   4. "Zoomen sparad" visas ZOOM_KVITTO_MS och försvinner.
//   5. Närhets-zoomen (inom KORVY_ZOOM_START_M) finns kvar, räknad från grundzoomen: samma tillägg som förut, på förarens nivå.
//   6. Grundzoomen sparas per maskin i localStorage och gäller nästa dag och på nästa objekt. Utan sparad zoom gäller KORVY_BASE_ZOOM.
//   7. Planeringsvyn och dess Centrera berörs inte (de använder aldrig det här).

export const KORVY_BASE_ZOOM = 17.5;    // standard: inget nära → lugn överblick, allt runt om ryms
export const KORVY_FULL_ZOOM = 18;      // full inzoom vid fällningsradien (mjukt, ej beskuret)
export const KORVY_ZOOM_START_M = 100;  // börja glida in här

/** Tillägget närhets-zoomen ger vid full inzoom: samma som förut (18 − 17,5), nu ovanpå förarens grundzoom. */
export const KORVY_NARA_TILLAGG = KORVY_FULL_ZOOM - KORVY_BASE_ZOOM;

/** Spannet en sparad grundzoom måste ligga i (MapLibre ritar 0–22, men utanför detta är kartan oanvändbar i en hytt). */
export const KORVY_ZOOM_MIN = 12;
export const KORVY_ZOOM_MAX = 20;

/** Hur länge Centrera hålls in för att ge valet. */
export const ZOOM_HALL_MS = 600;
/** Hur länge "Zoomen sparad" syns. */
export const ZOOM_KVITTO_MS = 1500;

export const ZOOM_NYCKEL = 'korvy_grundzoom_v1';

/** Närhets-zoom: dist (förarens avstånd till närmaste hindret) → mål-zoom. Full vid `fullM` (fällningsradien), grundzoom bortom KORVY_ZOOM_START_M, mjuk ramp emellan. */
export function narhetsZoom(dist: number | null | undefined, grund: number, fullM: number): number {
  if (dist == null || dist > KORVY_ZOOM_START_M) return grund;
  if (dist <= fullM) return grund + KORVY_NARA_TILLAGG;
  const t = (KORVY_ZOOM_START_M - dist) / (KORVY_ZOOM_START_M - fullM);   // 0..1
  return grund + KORVY_NARA_TILLAGG * t;
}

/** localStorage-nyckeln för en maskin. Okänd maskin (planerare utan maskinval) delar nyckeln 'ingen'. */
export function zoomNyckel(maskinId: string | null | undefined): string {
  return `${ZOOM_NYCKEL}:${maskinId || 'ingen'}`;
}

/** Tolka det sparade värdet: ett tal i spannet, annars null (trasigt värde ger standardzoomen, aldrig ett kast eller en konstig zoom). */
export function tolkaGrundzoom(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= KORVY_ZOOM_MIN && n <= KORVY_ZOOM_MAX ? n : null;
}

/** Förarens sparade grundzoom för maskinen, eller null. Tål blockerad eller saknad localStorage. */
export function hamtaGrundzoom(maskinId: string | null | undefined): number | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return tolkaGrundzoom(localStorage.getItem(zoomNyckel(maskinId)));
  } catch { return null; }
}

/** Grundzoomen som gäller: den sparade, annars standard. */
export function grundzoomFor(maskinId: string | null | undefined): number {
  return hamtaGrundzoom(maskinId) ?? KORVY_BASE_ZOOM;
}

/** Zoomen som sparas: avrundad till två decimaler och hållen i spannet. Icke-tal ger null (inget sparas). */
export function normaliseraZoom(zoom: number): number | null {
  if (!Number.isFinite(zoom)) return null;
  const klamd = Math.min(KORVY_ZOOM_MAX, Math.max(KORVY_ZOOM_MIN, zoom));
  return Math.round(klamd * 100) / 100;
}

/** Spara aktuell zoom som maskinens grundzoom. Returnerar det som gäller nu (också när localStorage är blockerad: då gäller den bara medan sidan är öppen). */
export function sparaGrundzoom(maskinId: string | null | undefined, zoom: number): number | null {
  const z = normaliseraZoom(zoom);
  if (z == null) return null;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(zoomNyckel(maskinId), String(z));
  } catch { /* blockerad localStorage: zoomen gäller medan sidan är öppen */ }
  return z;
}
