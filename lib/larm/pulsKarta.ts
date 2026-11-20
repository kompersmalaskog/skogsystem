// PULSEN på kartan: det STORA larmkortets objekt pulserar (mjukt sken i gruppens färg) så föraren ser vilket det är.
//   Symbol  en pulserande ring runt symbolen.
//   Linje   bara sträckan närmast maskinen (~40 m åt varje håll) pulserar, inte hela linjen (Kraftledning, El-ledning, Stenmur).
//   Yta     ytans kontur och fyllning.
// Objektet i den lilla "+"-raden lyser i sin färg som vanligt (larm-ring/larm-linje) men pulserar inte.
// Reglerna (geometrin, fasen, paint) är rena funktioner; sidan lägger bara in källan och lagren och uppdaterar paint med en timer.

import { klippLinjeNara, type LatLon } from './geo';

export const PULS_KALLA = 'larm-puls-source';
/** Linjens pulserande sträcka: så här långt åt varje håll från närmaste punkt. */
export const PULS_HALV_M = 40;
export const PULS_PERIOD_MS = 1600;

export type PulsGeometri = { type: 'Point' | 'LineString' | 'MultiLineString' | 'Polygon' | 'MultiPolygon' | 'MultiPoint'; coordinates: any };
export interface Puls { id: string; farg: string; geometri: PulsGeometri }

type Pos = [number, number];
const tillLL = (c: Pos): LatLon => ({ lat: c[1], lon: c[0] });
const tillPos = (p: LatLon): Pos => [p.lon, p.lat];

/** Geometrin som pulserar: linjer klipps till sträckan närmast `pos`, allt annat (punkt, yta) pulserar helt. */
export function pulsGeometri(g: PulsGeometri | null | undefined, pos: LatLon, halvM = PULS_HALV_M): PulsGeometri | null {
  if (!g) return null;
  if (g.type === 'LineString') return { type: 'LineString', coordinates: klippLinjeNara(pos, (g.coordinates as Pos[]).map(tillLL), halvM).map(tillPos) };
  if (g.type === 'MultiLineString') {
    // Pulsa på den del som ligger närmast.
    let bast: LatLon[] | null = null, bastD = Infinity;
    for (const l of g.coordinates as Pos[][]) {
      const ll = l.map(tillLL);
      const klippt = klippLinjeNara(pos, ll, halvM);
      const d = Math.min(...klippt.map((p) => Math.hypot((p.lon - pos.lon) * 111320 * Math.cos(pos.lat * Math.PI / 180), (p.lat - pos.lat) * 111320)));
      if (d < bastD) { bastD = d; bast = klippt; }
    }
    return bast ? { type: 'LineString', coordinates: bast.map(tillPos) } : null;
  }
  return g;
}

export function pulsData(puls: Puls | null | undefined, pos: LatLon | null) {
  // En linje klipps till sträckan närmast maskinen och behöver positionen; en yta eller punkt pulserar helt och behöver den inte (ⓘ-listans "flyg till ytan" utan GPS).
  const rak = !!puls && (puls.geometri.type === 'Polygon' || puls.geometri.type === 'MultiPolygon' || puls.geometri.type === 'Point' || puls.geometri.type === 'MultiPoint');
  const g = puls ? (pos ? pulsGeometri(puls.geometri, pos) : rak ? puls.geometri : null) : null;
  return {
    type: 'FeatureCollection' as const,
    features: puls && g ? [{ type: 'Feature' as const, properties: { id: puls.id, farg: puls.farg }, geometry: g as any }] : [],
  };
}

/** 0..1, mjuk fram och tillbaka (cosinus), en period = PULS_PERIOD_MS. Minskad rörelse: stilla på mitten. */
export function pulsFas(nuMs: number, minskadRorelse = false): number {
  if (minskadRorelse) return 0.5;
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * (nuMs % PULS_PERIOD_MS)) / PULS_PERIOD_MS);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Lagren (under ringlagren inte nödvändigt — ligger överst bland larmlagren). Prefixet `larm-` ligger i körvyns lager-whitelist. */
export function pulsLagerSpecar(): any[] {
  return [
    { id: 'larm-puls-fill', type: 'fill', source: PULS_KALLA, filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
      paint: { 'fill-color': ['get', 'farg'], 'fill-opacity': 0.1 } },
    { id: 'larm-puls-glod', type: 'line', source: PULS_KALLA, filter: ['!=', ['geometry-type'], 'Point'],
      paint: { 'line-color': ['get', 'farg'], 'line-width': 14, 'line-opacity': 0.3, 'line-blur': 6 }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
    { id: 'larm-puls-punkt', type: 'circle', source: PULS_KALLA, filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 30, 'circle-color': ['get', 'farg'], 'circle-opacity': 0.2, 'circle-blur': 0.8, 'circle-pitch-alignment': 'viewport' } },
  ];
}

/** Paint per lager vid fas 0..1 (mjukt sken: opacitet och storlek andas). */
export function pulsPaint(fas: number): Record<string, Record<string, number>> {
  return {
    'larm-puls-fill': { 'fill-opacity': lerp(0.06, 0.28, fas) },
    'larm-puls-glod': { 'line-width': lerp(10, 22, fas), 'line-opacity': lerp(0.2, 0.6, fas) },
    'larm-puls-punkt': { 'circle-radius': lerp(26, 44, fas), 'circle-opacity': lerp(0.12, 0.4, fas) },
  };
}
