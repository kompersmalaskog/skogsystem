// FLYG TILL YTAN (ⓘ-panelens rad, maskinläget): kartan flyger dit (ytan i bild, lagom zoom) och ytan pulserar kort — samma puls som larmen (lib/larm/pulsKarta). Rena funktioner:
// geometrin för ytan (Vidas tilläggsyta eller en egen ritad zon), dess ram och hur mycket av kartan som är täckt av panelen/arket.

import type { PlusLage } from './plusArk';
import type { PulsGeometri } from './larm/pulsKarta';
import { ytaNyckel } from './traktGeometri';
import { markerNyckel } from './kartkommentar';
import { ARK_HOJD_ANDEL } from './objektKarta';

/** Hur länge ytan pulserar (ms) efter ett tryck på raden: kort, inte kvar. */
export const YTA_PULS_MS = 3200;
/** Närmare än så här zoomar vi aldrig (lagom: ytan i bild, inte ett hörn av den). */
export const YTA_MAX_ZOOM = 18;

type Pos = [number, number];
export interface YtaGeo { geometri: PulsGeometri; bounds: [Pos, Pos] }

const punkter = (c: any, ut: Pos[] = []): Pos[] => {
  if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') ut.push([c[0], c[1]]);
  else if (Array.isArray(c)) for (const x of c) punkter(x, ut);
  return ut;
};

/** Ram [sydväst, nordost] runt en geometri. Null när den saknar punkter. */
export function geometriBounds(g: { coordinates: any } | null | undefined): [Pos, Pos] | null {
  const p = g ? punkter(g.coordinates) : [];
  if (!p.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of p) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return [[minX, minY], [maxX, maxY]];
}

/**
 * Geometrin för områdets nyckel: Vidas tilläggsyta (nyckeln `hansyn:<LOPNR>` ur `ytaNyckel`), annars en egen ritad zon/område (`marker:<id>` / `omrade:<id>`, polygonen ur svg-punkterna).
 * Null när ytan inte finns kvar (borttagen) — raden gör då ingenting.
 */
export function ytaGeo(o: { nyckel: string; features: ReadonlyArray<any> | null | undefined; markers: readonly any[]; svgToLatLon: (x: number, y: number) => { lat: number; lon: number } }): YtaGeo | null {
  for (const f of o.features ?? []) {
    const g = f?.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    if (ytaNyckel(f?.properties) !== o.nyckel) continue;
    const bounds = geometriBounds(g);
    return bounds ? { geometri: g as PulsGeometri, bounds } : null;
  }
  for (const m of o.markers) {
    const nyckel = m?.lineType === 'boundary' ? `omrade:${m.id}` : markerNyckel(m?.id);
    if (nyckel !== o.nyckel || !Array.isArray(m.path) || m.path.length < 3) continue;
    const ring: Pos[] = m.path.map((p: any) => { const ll = o.svgToLatLon(p.x, p.y); return [ll.lon, ll.lat] as Pos; });
    const geometri: PulsGeometri = { type: 'Polygon', coordinates: [[...ring, ring[0]]] };
    const bounds = geometriBounds(geometri);
    return bounds ? { geometri, bounds } : null;
  }
  return null;
}

/**
 * Hur mycket av kartan som är täckt när kameran siktar på ytan: bred skärm = panelen från höger (bredd + marginal), telefon = arket nerifrån (halv höjd) — då sitter ytan i den synliga
 * delen. Övrigt är luft kring figuren (toppen under objektpillen).
 */
export function ytaKameraPadding(lage: PlusLage, o: { fonsterH: number; panelBreddPx: number; luft: number; toppLuft: number }): { top: number; bottom: number; left: number; right: number } {
  if (lage === 'panel') return { top: o.toppLuft, bottom: o.luft, left: o.luft, right: o.luft + o.panelBreddPx };
  return { top: o.toppLuft, bottom: Math.round(o.fonsterH * ARK_HOJD_ANDEL) + o.luft, left: o.luft, right: o.luft };
}
