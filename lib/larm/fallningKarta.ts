// Fällningscirkelns KARTLAGER och paint — EN källa för sidan (app/planering/page.tsx) och för skärmdumpsriggen i PR-texten.
// Reglerna för färg och orsak ligger i lib/larm/fallning; här står bara hur det ritas.

import type { FallningUtfall } from './fallning';

export const FALL_KALLA = 'larm-fall-source';
export const FALL_CIRKEL_LAGER = 'gps-radie-line';

/** Lagren för orsaken (det som ger cirkeln dess färg). Prefixet `larm-` ligger i körvyns lager-whitelist (KEEP_PREFIX). */
export function fallningLagerSpecar(): any[] {
  return [
    { id: 'larm-fall-fill', type: 'fill', source: FALL_KALLA, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': ['get', 'farg'], 'fill-opacity': 0.3 } },
    { id: 'larm-fall-kant', type: 'line', source: FALL_KALLA, filter: ['!=', ['geometry-type'], 'Point'],
      paint: { 'line-color': '#000000', 'line-width': 9, 'line-opacity': 0.5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
    { id: 'larm-fall-linje', type: 'line', source: FALL_KALLA, filter: ['!=', ['geometry-type'], 'Point'],
      paint: { 'line-color': ['get', 'farg'], 'line-width': 5, 'line-opacity': 1 }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
    { id: 'larm-fall-punkt', type: 'circle', source: FALL_KALLA, filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 22, 'circle-color': ['get', 'farg'], 'circle-opacity': 0.25, 'circle-stroke-color': ['get', 'farg'], 'circle-stroke-width': 4, 'circle-stroke-opacity': 1, 'circle-pitch-alignment': 'viewport' } },
  ];
}

/** Cirkelns linje: neutral = vit, svag, 2 px, streckad. Färgad = gruppens färg, 4 px, heldragen. Osynlig när `visa` är false (skotarläget, ingen position). */
export function fallningCirkelPaint(fall: Pick<FallningUtfall, 'farg' | 'opacitet' | 'grupp'>, visa: boolean): Record<string, any> {
  return {
    'line-color': fall.farg,
    'line-opacity': visa ? fall.opacitet : 0,
    'line-width': fall.grupp ? 4 : 2,
    'line-dasharray': fall.grupp ? [1, 0] : [2, 2],
  };
}

/** Orsakerna som GeoJSON-features i gruppens färg. */
export function fallningOrsakData(fall: FallningUtfall, visa: boolean) {
  return {
    type: 'FeatureCollection' as const,
    features: visa ? fall.orsaker.filter((o) => o.geometri).map((o) => ({ type: 'Feature' as const, properties: { id: o.id, namn: o.namn, farg: fall.farg }, geometry: o.geometri as any })) : [],
  };
}
