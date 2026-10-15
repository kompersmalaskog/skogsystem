// Om trakten › "Visa ›": vad som framhävs på kartan och hur kameran går dit. Rena funktioner (sidan går inte att montera i test).
//   Symbol  → en pulserande ring runt punkten.
//   Linje   → HELA linjen (inte en punkt) får en pulserande glöd.
//   Yta     → hela ytans kontur + ett pulserande fält.
// Övriga markeringar tonas ner tills man trycker på kartan eller väljer en annan.

import type { KartMarkering } from './objektKort';

export interface FramhavdMarkering {
  id: string;
  slag: KartMarkering['slag'];
  lat: number | null;
  lng: number | null;
  geometri?: { lat: number; lng: number }[];
}

export const FRAMHAV_KALLA = 'omtrakten-framhav-kalla';
export const FRAMHAV_LAGER = {
  fyll: 'omtrakten-framhav-fyll',
  glod: 'omtrakten-framhav-glod',
  linje: 'omtrakten-framhav-linje',
  ring: 'omtrakten-framhav-ring',
} as const;
/** Andra markeringar tonas ner till så här mycket (ytor lägre, de är stora). */
export const DIMMA_OPACITET = 0.25;
export const DIMMA_FYLL_OPACITET = 0.06;

export const framhavdFran = (m: Pick<KartMarkering, 'id' | 'slag' | 'lat' | 'lng' | 'geometri'>): FramhavdMarkering =>
  ({ id: m.id, slag: m.slag, lat: m.lat, lng: m.lng, geometri: m.geometri });

const giltig = (p: { lat: number; lng: number }) => Number.isFinite(p.lat) && Number.isFinite(p.lng);

/** Geometrin som ritas: linje → LineString av ALLA punkter, yta → sluten Polygon, annars (eller utan geometri) en Point. */
export function framhavGeoJson(f: FramhavdMarkering | null): { type: 'FeatureCollection'; features: any[] } {
  const tom = { type: 'FeatureCollection' as const, features: [] as any[] };
  if (!f) return tom;
  const pts = (f.geometri ?? []).filter(giltig);
  if (f.slag === 'linje' && pts.length >= 2) {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: f.id }, geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lng, p.lat]) } }] };
  }
  if (f.slag === 'zon' && pts.length >= 3) {
    const ring = pts.map((p) => [p.lng, p.lat]);
    const [a, b] = [ring[0], ring[ring.length - 1]];
    if (a[0] !== b[0] || a[1] !== b[1]) ring.push(ring[0]);
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: f.id }, geometry: { type: 'Polygon', coordinates: [ring] } }] };
  }
  if (f.lat != null && f.lng != null && Number.isFinite(f.lat) && Number.isFinite(f.lng)) {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: f.id }, geometry: { type: 'Point', coordinates: [f.lng, f.lat] } }] };
  }
  return tom;
}

/** Ramen kameran ska rymma (bara linje/yta med minst två punkter) — annars null och kameran flyger till punkten. */
export function framhavBounds(f: FramhavdMarkering | null): [[number, number], [number, number]] | null {
  if (!f || f.slag === 'symbol') return null;
  const pts = (f.geometri ?? []).filter(giltig);
  if (pts.length < 2) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of pts) { w = Math.min(w, p.lng); e = Math.max(e, p.lng); s = Math.min(s, p.lat); n = Math.max(n, p.lat); }
  return [[w, s], [e, n]];
}

export interface DimmaMal { id: string; prop: 'icon-opacity' | 'circle-opacity' | 'line-opacity' | 'fill-opacity'; dim: number }

/** Vilka lager som tonas ner och hur: markeringarnas symboler, prickar, linjer (traktgränsen behålls — den är alltid synlig), ytor och pilar. */
export function dimmaMal(lagerIds: readonly string[]): DimmaMal[] {
  const ut: DimmaMal[] = [];
  for (const id of lagerIds) {
    if (id.startsWith('omtrakten-')) continue;
    if (id === 'markers-layer' || id === 'arrows-layer') ut.push({ id, prop: 'icon-opacity', dim: DIMMA_OPACITET });
    else if (id === 'markers-prick') ut.push({ id, prop: 'circle-opacity', dim: DIMMA_OPACITET });
    else if (id.startsWith('line-boundary')) continue;
    else if (id.startsWith('line-')) ut.push({ id, prop: 'line-opacity', dim: DIMMA_OPACITET });
    else if (id === 'zone-fill') ut.push({ id, prop: 'fill-opacity', dim: DIMMA_FYLL_OPACITET });
    else if (id.startsWith('zone-outline')) ut.push({ id, prop: 'line-opacity', dim: DIMMA_OPACITET });
  }
  return ut;
}

/** Pulsen 0 → 1 → 0 över `periodMs` (mjuk, cosinus). Minskad rörelse: stilla på mitten. */
export function pulsFas(nowMs: number, periodMs = 1400, minskadRorelse = false): number {
  if (minskadRorelse) return 0.5;
  const ph = (((nowMs % periodMs) + periodMs) % periodMs) / periodMs;
  return 0.5 - 0.5 * Math.cos(ph * 2 * Math.PI);
}
