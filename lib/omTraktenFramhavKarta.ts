// Om trakten › "Visa ›" mot kartan (MapLibre): framhäv den valda markeringen, tona ner övriga, pulsera, och släpp vid tryck på kartan.
// Egen fil så att exakt samma kod kan köras i en riktig MapLibre-karta i en testrigg — sidan själv går inte att montera i test.

import {
  DIMMA_FYLL_OPACITET, FRAMHAV_KALLA, FRAMHAV_LAGER, dimmaMal, framhavGeoJson, pulsFas, type FramhavdMarkering,
} from './omTraktenFramhav';

/** Den delen av kartan vi använder (MapLibre `Map`). */
export interface FramhavKarta {
  getStyle(): any;
  getSource(id: string): any;
  addSource(id: string, spec: any): any;
  getLayer(id: string): any;
  addLayer(spec: any, before?: string): any;
  getPaintProperty(layer: string, prop: string): any;
  setPaintProperty(layer: string, prop: string, value: any): any;
  once(type: 'click', fn: () => void): any;
  off(type: 'click', fn: () => void): any;
}

/** Spärr efter att framhävningen startat: trycket som öppnade den får inte släppa den. */
export const SLAPP_SPARR_MS = 500;
const PULS_MS = 1400;
const BILD_MS = 33;   // ~30 bilder/s

/**
 * Startar framhävningen och ger tillbaka en funktion som städar: återställer varje lager till exakt det värde det hade, tömmer källan och stoppar pulsen.
 * Symbol = ring runt punkten. Linje = HELA linjen får en glöd. Yta = hela konturen + fält. Alla andra markeringar tonas ner (den valda behåller sin opacitet).
 */
export function startaFramhavning(map: FramhavKarta, f: FramhavdMarkering, o: { onSlapp: () => void; minskadRorelse?: boolean }): () => void {
  const sparade: { id: string; prop: string; orig: any }[] = [];
  let raf = 0; let sist = 0; let klickTimer: ReturnType<typeof setTimeout> | null = null;
  const minskad = !!o.minskadRorelse;
  try {
    const lagerIds: string[] = (map.getStyle()?.layers ?? []).map((l: any) => l.id);
    // Framhävningens lager läggs UNDER markeringarnas egna, så glöden aldrig döljer linjen den framhäver.
    const forstaEgna = lagerIds.find((id) => id.startsWith('line-') || id.startsWith('zone-') || id.startsWith('markers-') || id.startsWith('arrows-'));
    const data: any = framhavGeoJson(f);
    const src = map.getSource(FRAMHAV_KALLA);
    if (src) src.setData(data); else map.addSource(FRAMHAV_KALLA, { type: 'geojson', data });
    const lagg = (spec: any) => { if (!map.getLayer(spec.id)) map.addLayer(spec, forstaEgna); };
    lagg({ id: FRAMHAV_LAGER.fyll, type: 'fill', source: FRAMHAV_KALLA, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.25 } });
    lagg({ id: FRAMHAV_LAGER.glod, type: 'line', source: FRAMHAV_KALLA, filter: ['!=', ['geometry-type'], 'Point'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 16, 'line-opacity': 0.5, 'line-blur': 3 } });
    lagg({ id: FRAMHAV_LAGER.ring, type: 'circle', source: FRAMHAV_KALLA, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 26, 'circle-color': '#ffffff', 'circle-opacity': 0.16, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3, 'circle-stroke-opacity': 0.9, 'circle-pitch-alignment': 'map' } });
    // Tona ner alla andra markeringar.
    for (const mal of dimmaMal(lagerIds)) {
      try {
        const orig = map.getPaintProperty(mal.id, mal.prop);
        sparade.push({ id: mal.id, prop: mal.prop, orig });
        map.setPaintProperty(mal.id, mal.prop, ['case', ['==', ['get', 'id'], f.id], orig ?? 1, mal.dim]);
      } catch { /* uttrycket gick inte att linda in (t.ex. zoom-interpolering) — lagret lämnas som det är */ }
    }
  } catch { /* kartan inte redo */ }

  const stil = (s: number) => {
    try {
      if (map.getLayer(FRAMHAV_LAGER.ring)) { map.setPaintProperty(FRAMHAV_LAGER.ring, 'circle-radius', 20 + 18 * s); map.setPaintProperty(FRAMHAV_LAGER.ring, 'circle-stroke-opacity', 1 - 0.55 * s); map.setPaintProperty(FRAMHAV_LAGER.ring, 'circle-opacity', 0.28 - 0.2 * s); }
      if (map.getLayer(FRAMHAV_LAGER.glod)) { map.setPaintProperty(FRAMHAV_LAGER.glod, 'line-width', 12 + 10 * s); map.setPaintProperty(FRAMHAV_LAGER.glod, 'line-opacity', 0.75 - 0.4 * s); }
      if (map.getLayer(FRAMHAV_LAGER.fyll)) map.setPaintProperty(FRAMHAV_LAGER.fyll, 'fill-opacity', 0.35 - 0.25 * s + DIMMA_FYLL_OPACITET);
    } catch { /* */ }
  };
  stil(pulsFas(0, PULS_MS, minskad));
  if (!minskad && typeof requestAnimationFrame !== 'undefined') {
    const tick = (nu: number) => { if (nu - sist >= BILD_MS) { sist = nu; stil(pulsFas(nu, PULS_MS)); } raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
  }
  // Släpps vid tryck på kartan (efter en kort spärr).
  klickTimer = setTimeout(() => { klickTimer = null; map.once('click', o.onSlapp); }, SLAPP_SPARR_MS);

  return () => {
    if (raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf);
    if (klickTimer) clearTimeout(klickTimer);
    try { map.off('click', o.onSlapp); } catch { /* */ }
    for (const sp of sparade) { try { map.setPaintProperty(sp.id, sp.prop, sp.orig === undefined ? null : sp.orig); } catch { /* */ } }
    try { map.getSource(FRAMHAV_KALLA)?.setData({ type: 'FeatureCollection', features: [] }); } catch { /* */ }
  };
}
