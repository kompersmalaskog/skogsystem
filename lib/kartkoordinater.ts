// Objektets kartkoordinater: fran planeringsvyns SVG-rymd till WGS84.
//
// BAKGRUND. Planeringsmarkeringar lagras INTE i lat/lng. De ligger som x/y i en
// skarmrymd relativt objektets kartcentrum - path {x,y} for linjer och zoner,
// {x,y} for symboler. For att rita dem pa en riktig karta maste de konverteras
// med EXAKT samma origo och skala som planeringsvyn anvande nar de ritades.
// Anvands ett annat origo hamnar markeringen flera mil fel; den familjen av fel
// har intraffat tva ganger (#278 auto-valt objekt, #322 matverktyget).
//
// KOPIOR SOM FINNS KVAR. Samma logik ligger i dag ocksa i:
//   app/planering/page.tsx   (originalet)
//   app/planner/page.tsx
//   app/oversikt/SkordarKarta.tsx  (uttalad replik, med samma varning)
// Den har filen ar identisk med dem i BERAKNINGEN. Den ar avsiktligt inte
// inkopplad i de tre - forarkartan gar inte att verifiera visuellt i nagon
// automatiserad miljo (MapLibre renderar inte i den inbaddade webblasaren), och
// att flytta forarnas karta i en PR om nagot annat vore fel sorts risk. En egen
// liten PR far peka om dem, en at gangen, med kartan sida vid sida fore och efter.

export type Origo = { lat: number; lng: number; zoom: number };
export type LatLng = { lat: number; lng: number };

/** [[south, west], [north, east]] - formatet som ligger i objekt.kartbild_bounds. */
type Bounds = [[number, number], [number, number]];

function lasBounds(varde: unknown): Bounds | null {
  const b = varde as Bounds | null;
  if (!Array.isArray(b) || !Array.isArray(b[0]) || !Array.isArray(b[1])) return null;
  if (b[0][0] == null || b[0][1] == null || b[1][0] == null || b[1][1] == null) return null;
  return b;
}

export type KartObjekt = {
  lat?: number | null;
  lng?: number | null;
  kartbild_bounds?: unknown;
};

/**
 * Origo HARLETT UR BOUNDS. null nar bounds saknas.
 *
 * Detta ar den enda varianten egenkontrollen anvander. Saknas bounds ritas inga
 * markeringar alls - hellre inga an nagra pa fel plats.
 */
export function kartOrigoFranBounds(o: KartObjekt): Origo | null {
  const b = lasBounds(o.kartbild_bounds);
  if (!b) return null;
  return { lat: (b[0][0] + b[1][0]) / 2, lng: (b[0][1] + b[1][1]) / 2, zoom: 15 };
}

/**
 * Origo med lat/lng-fallback - SAMMA beteende som planeringsvyn och forarkartan.
 *
 * VARNING: fallbacken anvander ett ANNAT origo (objektets punkt, zoom 16) an det
 * planeraren ritade mot. Ger den ratt lage ar det en lycklig slump. Finns har for
 * att de befintliga kopiorna ska kunna peka hit utan beteendeandring - valj
 * kartOrigoFranBounds nar det viktiga ar att inte visa nagot fel.
 */
export function kartOrigoMedFallback(o: KartObjekt): Origo | null {
  const franBounds = kartOrigoFranBounds(o);
  if (franBounds) return franBounds;
  if (o.lat != null && o.lng != null) return { lat: o.lat, lng: o.lng, zoom: 16 };
  return null;
}

/**
 * SVG-punkt -> WGS84. Identisk med planeringsvyns svgToLatLon.
 *
 * 156543.03392 = meter per pixel vid ekvatorn i zoom 0 (Web Mercator).
 * y ar inverterad: skarmens y vaxer nedat, latitud uppat.
 */
export function svgToLatLon(x: number, y: number, c: Origo): LatLng {
  const scale = (156543.03392 * Math.cos((c.lat * Math.PI) / 180)) / Math.pow(2, c.zoom);
  const mPerDegLon = 111320 * Math.cos((c.lat * Math.PI) / 180);
  return { lat: c.lat + (-y * scale) / 111320, lng: c.lng + (x * scale) / mPerDegLon };
}

/** [lng, lat] - ordningen GeoJSON och MapLibre vill ha. */
export function svgTillGeoJson(x: number, y: number, c: Origo): [number, number] {
  const p = svgToLatLon(x, y, c);
  return [p.lng, p.lat];
}

export type SvgPunkt = { x?: number | null; y?: number | null };

/** Konverterar en path. Punkter utan x/y hoppas over. */
export function pathTillGeoJson(path: SvgPunkt[], c: Origo): [number, number][] {
  return path
    .filter((p) => p && p.x != null && p.y != null)
    .map((p) => svgTillGeoJson(p.x as number, p.y as number, c));
}
