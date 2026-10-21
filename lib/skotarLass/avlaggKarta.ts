// Avläggen på kartan i skotarläget: vita rutor med numret i (rutan växer med numret — icon-text-fit — så "01-1" alltid ryms), vald får en mörk ring med vit kant, och en 56 px stor osynlig träffyta. De gamla avläggssymbolerna (Vidas punkt
// och egna markeringar) göms med filter medan skotarläget är aktivt — rutorna tar över som synlig symbol OCH träffyta. Delad mellan sidan och kartprovet.
import type { Avlagg } from './typer';

export const RUTA_BILD = 'skotar-avlagg-ruta';
export const KALLA = 'skotar-avlagg-source';
export const LAGER = ['skotar-avlagg-ring', 'skotar-avlagg-ruta', 'skotar-avlagg-hit', 'skotar-avlagg-ring-kant'] as const;
/** Rutans bild är sträckbar: hörnen (12 px av 40) står kvar, mitten växer med texten. */
export const RUTA_STRACK = { stretchX: [[12, 28]], stretchY: [[12, 28]], content: [12, 12, 28, 28] } as const;
/** Lager vars filter byts medan skotarläget är aktivt (och sätts tillbaka efteråt). */
export const FILTRERADE = ['trakt-punkt-circle', 'trakt-punkt-label', 'markers-layer', 'markers-hit'] as const;

export function avlaggFeatures(avlagg: readonly Avlagg[], valtId: string | null) {
  return {
    type: 'FeatureCollection' as const,
    features: avlagg.map((a) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [a.lng, a.lat] }, properties: { id: a.id, nummer: a.nummer, vald: a.id === valtId } })),
  };
}

function ritaRuta(): ImageData | null {
  const px = 40, c = document.createElement('canvas'); c.width = px; c.height = px;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#ffffff'; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2;
  const r = 6, m = 3, w = px - 2 * m;
  g.beginPath(); g.moveTo(m + r, m); g.arcTo(m + w, m, m + w, m + w, r); g.arcTo(m + w, m + w, m, m + w, r); g.arcTo(m, m + w, m, m, r); g.arcTo(m, m, m + w, m, r); g.closePath();
  g.fill(); g.stroke();
  return g.getImageData(0, 0, px, px);
}

/** Lägger till bild, källa och lager, och byter filter på de gamla avläggslagren. Ger originalfiltren (att sätta tillbaka). */
export function laggTillAvlaggslager(map: any): Record<string, any> {
  if (!map.hasImage(RUTA_BILD)) { const bild = ritaRuta(); if (bild) map.addImage(RUTA_BILD, bild, { pixelRatio: 2, stretchX: RUTA_STRACK.stretchX.map((r) => [...r]), stretchY: RUTA_STRACK.stretchY.map((r) => [...r]), content: [...RUTA_STRACK.content] }); }
  if (!map.getSource(KALLA)) map.addSource(KALLA, { type: 'geojson', data: avlaggFeatures([], null) });
  if (!map.getLayer(LAGER[3])) map.addLayer({ id: LAGER[3], type: 'circle', source: KALLA, filter: ['==', ['get', 'vald'], true], paint: { 'circle-radius': 40, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 8, 'circle-pitch-alignment': 'viewport' } });
  if (!map.getLayer(LAGER[0])) map.addLayer({ id: LAGER[0], type: 'circle', source: KALLA, filter: ['==', ['get', 'vald'], true], paint: { 'circle-radius': 40, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#111111', 'circle-stroke-width': 4, 'circle-pitch-alignment': 'viewport' } });
  if (!map.getLayer(LAGER[1])) map.addLayer({
    id: LAGER[1], type: 'symbol', source: KALLA,
    layout: { 'icon-image': RUTA_BILD, 'icon-text-fit': 'both', 'icon-text-fit-padding': [3, 7, 3, 7], 'icon-size': 1, 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'text-field': ['to-string', ['get', 'nummer']], 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12, 14, 16, 17, 20], 'text-font': ['Open Sans Bold'], 'text-allow-overlap': true, 'text-ignore-placement': true, 'text-anchor': 'center' },
    paint: { 'text-color': '#000000' },
  });
  if (!map.getLayer(LAGER[2])) map.addLayer({ id: LAGER[2], type: 'circle', source: KALLA, paint: { 'circle-radius': 36, 'circle-color': 'rgba(0,0,0,0)', 'circle-pitch-alignment': 'viewport' } });

  const orig: Record<string, any> = {};
  for (const id of FILTRERADE) if (map.getLayer(id)) orig[id] = map.getFilter(id) ?? null;
  const dold = ['==', ['get', '_typ'], '__skotar_dold__'];
  for (const id of ['trakt-punkt-circle', 'trakt-punkt-label']) if (map.getLayer(id)) map.setFilter(id, dold);
  const ejLanding = ['!=', ['get', 'type'], 'landing'];
  if (map.getLayer('markers-layer')) map.setFilter('markers-layer', ['all', orig['markers-layer'] ?? ['!=', ['get', 'prick'], true], ejLanding]);
  if (map.getLayer('markers-hit')) map.setFilter('markers-hit', ejLanding);
  return orig;
}

/** Tar bort rutorna och sätter tillbaka de gamla lagrens filter. */
export function taBortAvlaggslager(map: any, orig: Record<string, any>): void {
  for (const id of [LAGER[2], LAGER[1], LAGER[0], LAGER[3]]) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(KALLA)) map.removeSource(KALLA);
  for (const id of FILTRERADE) if (map.getLayer(id) && id in orig) map.setFilter(id, orig[id]);
}
