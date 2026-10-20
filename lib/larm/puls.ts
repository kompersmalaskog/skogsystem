// PULSEN på kartan: det stora larmets objekt får ett mjukt sken i gruppens färg som pulserar, så föraren ser VILKET larm kortet gäller.
// Linjer (Kraftledning, El-ledning, Stenmur) pulserar bara på sträckan närmast maskinen (PULS_HALV_M åt varje håll), inte hela linjen.
// Ren: geometrin och fasen räknas här; sidan (app/planering/page.tsx) skickar dem till kartlagren.

import { avstandTillLinjeM, strackaNarmast, type LatLon } from './geo';

export const PULS_HALV_M = 40;
export const PULS_PERIOD_MS = 1600;
export const PULS_KALLA = 'larm-puls-source';

type Geometri = { type: string; coordinates: any };
const tillLL = (p: number[]): LatLon => ({ lat: p[1], lon: p[0] });
const tillPunkt = (p: LatLon): [number, number] => [p.lon, p.lat];

/** Geometrin som ska pulsera: punkter och ytor som de är, linjer bara närmaste sträckan. Null om geometrin saknas eller inte går att tolka. */
export function pulsGeometri(geom: Geometri | null | undefined, pos: LatLon, halvM: number = PULS_HALV_M): Geometri | null {
  if (!geom?.coordinates) return null;
  if (geom.type === 'LineString') {
    const linje = (geom.coordinates as number[][]).map(tillLL);
    if (linje.length < 2) return null;
    return { type: 'LineString', coordinates: strackaNarmast(pos, linje, halvM).map(tillPunkt) };
  }
  if (geom.type === 'MultiLineString') {
    // Flera delar (Vidas kraftledning kan vara en MultiLineString): den del som ligger närmast maskinen.
    let bast: LatLon[] | null = null, bastD = Infinity;
    for (const del of geom.coordinates as number[][][]) {
      const linje = del.map(tillLL);
      if (linje.length < 2) continue;
      const d = avstandTillLinjeM(pos, linje);
      if (d < bastD) { bastD = d; bast = linje; }
    }
    return bast ? { type: 'LineString', coordinates: strackaNarmast(pos, bast, halvM).map(tillPunkt) } : null;
  }
  return geom as Geometri;
}

/** Pulsens fas 0..1 (mjuk upp och ned, ingen blinkning). Med minskad rörelse står den still på 0. */
export function pulsFas(tidMs: number, minskadRorelse = false): number {
  if (minskadRorelse) return 0;
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * (tidMs % PULS_PERIOD_MS)) / PULS_PERIOD_MS);
}

/** Paint-värden för fasen `f` (0 = svagast/minst, 1 = starkast/störst). */
export function pulsPaint(f: number) {
  return {
    punktRadie: 26 + 16 * f,
    punktOpacitet: 0.5 - 0.3 * f,
    linjeOpacitet: 0.9 - 0.55 * f,
    linjeBredd: 10 + 6 * f,
    ytaOpacitet: 0.34 - 0.2 * f,
  };
}

/** Lagren för pulsen. Prefixet `larm-` ligger i körvyns lager-whitelist (KEEP_PREFIX). */
export function pulsLagerSpecar(): any[] {
  return [
    { id: 'larm-puls-yta', type: 'fill', source: PULS_KALLA, filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']], paint: { 'fill-color': ['get', 'farg'], 'fill-opacity': 0.34 } },
    { id: 'larm-puls-linje', type: 'line', source: PULS_KALLA, filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'MultiLineString'], ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
      paint: { 'line-color': ['get', 'farg'], 'line-width': 10, 'line-opacity': 0.9, 'line-blur': 3 }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
    { id: 'larm-puls-punkt', type: 'circle', source: PULS_KALLA, filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 26, 'circle-color': ['get', 'farg'], 'circle-opacity': 0.5, 'circle-blur': 0.7, 'circle-pitch-alignment': 'viewport' } },
  ];
}

/** Datat till pulskällan: ett enda objekt, det stora larmets. */
export function pulsData(puls: { id: string; farg: string; geometri: Geometri } | null) {
  return {
    type: 'FeatureCollection' as const,
    features: puls ? [{ type: 'Feature' as const, properties: { id: puls.id, farg: puls.farg }, geometry: puls.geometri as any }] : [],
  };
}
