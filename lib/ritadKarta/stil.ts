// RITAD KARTA — utseendet på ETT ställe: skogsklassernas färger, trädsymbolen och vektorlagren (vatten, vägar, hus).
// Mörk karta som appen (svart botten). Mörkare grönt = äldre skog. Det avverkade är ljusast: trakten ska synas först.

import type { Klass } from './skog';

export const BAKGRUND = '#1f211d';

/** RGBA per klass i skogsbilden. 'ingen' = genomskinlig (bakgrunden syns). */
export const KLASS_FARG: Record<Klass, [number, number, number, number]> = {
  ingen: [0, 0, 0, 0],
  // Tre gröna som går att skilja med en blick (Martin 2026-10-31: gallring och mogen var nästan samma): ljust = ungt, mörkt = moget.
  oppet: [92, 90, 74, 255],
  ung: [112, 158, 86, 255],
  gallring: [64, 120, 68, 255],
  mogen: [26, 70, 42, 255],
  avverkat: [146, 126, 90, 255],
};

/** I ord, för teckenförklaringen. */
export const KLASS_NAMN: Record<Exclude<Klass, 'ingen'>, string> = {
  avverkat: 'Avverkat',
  oppet: 'Öppet / hygge',
  ung: 'Ungskog (under 7 m)',
  gallring: 'Gallringsskog (7–16 m)',
  mogen: 'Mogen skog (över 16 m)',
};

/** Trädsymbolen: en gran i tre våningar med mörk kant och liten stam (Snapchat-stil). Ritas på en canvas, pixelRatio 2. */
export function ritaGran(fyll: string, kant = '#0e1a12', px = 64): ImageData | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const g = c.getContext('2d');
  if (!g) return null;
  const m = px / 2;
  g.lineJoin = 'round';
  g.lineWidth = px * 0.05;
  g.strokeStyle = kant;
  // stam
  g.fillStyle = '#5a4630';
  g.fillRect(m - px * 0.05, px * 0.78, px * 0.1, px * 0.18);
  g.strokeRect(m - px * 0.05, px * 0.78, px * 0.1, px * 0.18);
  // tre våningar, nedifrån
  const vaningar: [number, number, number][] = [[0.82, 0.42, 0.5], [0.6, 0.33, 0.3], [0.4, 0.24, 0.08]];
  g.fillStyle = fyll;
  for (const [botten, halv, topp] of vaningar) {
    g.beginPath();
    g.moveTo(m, px * topp);
    g.lineTo(m + px * halv, px * botten);
    g.lineTo(m - px * halv, px * botten);
    g.closePath();
    g.fill();
    g.stroke();
  }
  return g.getImageData(0, 0, px, px);
}

/** Skogen i 3D (steg 2): kronornas färg per klass, från mörkaste (ton 0) till ljusaste (ton 1) — varje träd får sin egen ton så skogen lever. */
export const KRONA_FARG = {
  ung: ['#4a7a44', '#6b9a5c'],
  gallring: ['#2f6a3c', '#4d8a55'],
  mogen: ['#22573a', '#3a7a4e'],
} as const;
/** Lutning (grader) där skogen ställer sig upp och trädsymbolerna försvinner. Under den: platt karta med träd. */
export const LUTAD_PITCH = 20;
/** MapLibre-uttrycket för kronans färg. */
export const KRONA_FARG_UTTRYCK = ['interpolate', ['linear'], ['get', 't'],
  0, ['match', ['get', 'k'], 'ung', KRONA_FARG.ung[0], 'gallring', KRONA_FARG.gallring[0], KRONA_FARG.mogen[0]],
  1, ['match', ['get', 'k'], 'ung', KRONA_FARG.ung[1], 'gallring', KRONA_FARG.gallring[1], KRONA_FARG.mogen[1]]] as const;
/** Terrängen när kartan lutas: backarna överdrivs lite så småländsk terräng syns. */
export const TERRANG_OVERDRIFT = 1.4;

/** Himlen och diset när kartan lutas: horisonten tonar mot en dämpad kvällsblå i stället för att kartan slutar i svart (Apple-kartans djup). */
export const HIMMEL = {
  'sky-color': '#2a3a4f',
  'horizon-color': '#56677a',
  'fog-color': '#3c4b5a',
  'sky-horizon-blend': 0.6,
  'horizon-fog-blend': 0.7,
  'fog-ground-blend': 0.55,
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 10, 1, 16, 0.6],
} as const;
/** Solljuset på 3D-skogen: snett från sydväst och kartans riktning, så varje träd har en ljus och en mörk sida. */
export const LJUS = { anchor: 'map' as const, color: '#fff6e0', intensity: 0.45, position: [1.4, 225, 35] as [number, number, number] };

/** Terrängskuggning (MapLibres hillshade på samma höjddata som 3D-terrängen): mörkt i skuggan, en aning ljust i solen, platt mark orörd. */
export const RELIEF_KALLA = { type: 'raster-dem' as const, tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 15, encoding: 'terrarium' as const };
// Ljus från fyra håll (Martin 2026-10-31: sluttningar mot solen blev platta med en enda sol): nordväst starkast, som en vanlig karta,
// tre till fyller i. Samma riktningar och vikter som höjdmodellens skuggning (lib/ritadKarta/hojd.ts LJUS_RIKTNINGAR).
export const RELIEF_PAINT = {
  'hillshade-method': 'multidirectional',
  'hillshade-illumination-direction': [225, 270, 315, 0],
  'hillshade-illumination-altitude': [45, 45, 45, 45],
  'hillshade-shadow-color': ['rgba(0,0,0,0.18)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.35)'],
  'hillshade-highlight-color': ['rgba(255,248,230,0.03)', 'rgba(255,248,230,0.06)', 'rgba(255,248,230,0.1)', 'rgba(255,248,230,0.06)'],
  'hillshade-exaggeration': 0.55,
} as const;

export const TRAD_FARG = { ung: '#8cc084', gallring: '#6fae74', mogen: '#5a9a68' } as const;

/** OpenFreeMap (OpenMapTiles-schemat, fri, ingen nyckel) — vatten, vägar och hus som platta vektorer. */
export const VEKTOR_KALLA = { type: 'vector' as const, url: 'https://tiles.openfreemap.org/planet' };

export const VEKTOR_LAGER = [
  { id: 'rk-vatten', type: 'fill', source: 'vektor', 'source-layer': 'water', paint: { 'fill-color': '#2f6e9c' } },
  { id: 'rk-vattendrag', type: 'line', source: 'vektor', 'source-layer': 'waterway', paint: { 'line-color': '#3f86b8', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 17, 2.5] } },
  { id: 'rk-hus', type: 'fill', source: 'vektor', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': '#3a3a3c' } },
  { id: 'rk-vag-kant', type: 'line', source: 'vektor', 'source-layer': 'transportation', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#141414', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 17, ['match', ['get', 'class'], ['track', 'path'], 4, 9]] } },
  { id: 'rk-vag', type: 'line', source: 'vektor', 'source-layer': 'transportation', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['match', ['get', 'class'], ['track', 'path'], '#8a8478', '#d8d4c8'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 17, ['match', ['get', 'class'], ['track', 'path'], 2, 6]] } },
] as const;
