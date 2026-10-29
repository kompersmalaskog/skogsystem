// RITAD KARTA — utseendet på ETT ställe: skogsklassernas färger, trädsymbolen och vektorlagren (vatten, vägar, hus).
// Mörk karta som appen (svart botten). Mörkare grönt = äldre skog. Det avverkade är ljusast: trakten ska synas först.

import type { Klass } from './skog';

export const BAKGRUND = '#1f211d';

/** RGBA per klass i skogsbilden. 'ingen' = genomskinlig (bakgrunden syns). */
export const KLASS_FARG: Record<Klass, [number, number, number, number]> = {
  ingen: [0, 0, 0, 0],
  oppet: [52, 55, 46, 255],
  ung: [72, 112, 70, 255],
  gallring: [48, 92, 58, 255],
  mogen: [32, 70, 46, 255],
  avverkat: [118, 104, 80, 255],
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

export const TRAD_FARG = { ung: '#8cc084', gallring: '#6fae74', mogen: '#5a9a68' } as const;

/** OpenFreeMap (OpenMapTiles-schemat, fri, ingen nyckel) — vatten, vägar och hus som platta vektorer. */
export const VEKTOR_KALLA = { type: 'vector' as const, url: 'https://tiles.openfreemap.org/planet' };

export const VEKTOR_LAGER = [
  { id: 'rk-vatten', type: 'fill', source: 'vektor', 'source-layer': 'water', paint: { 'fill-color': '#1e3a4c' } },
  { id: 'rk-vattendrag', type: 'line', source: 'vektor', 'source-layer': 'waterway', paint: { 'line-color': '#2b5670', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 17, 2.5] } },
  { id: 'rk-hus', type: 'fill', source: 'vektor', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': '#3a3a3c' } },
  { id: 'rk-vag-kant', type: 'line', source: 'vektor', 'source-layer': 'transportation', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#141414', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 17, ['match', ['get', 'class'], ['track', 'path'], 4, 9]] } },
  { id: 'rk-vag', type: 'line', source: 'vektor', 'source-layer': 'transportation', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['match', ['get', 'class'], ['track', 'path'], '#8a8478', '#d8d4c8'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 17, ['match', ['get', 'class'], ['track', 'path'], 2, 6]] } },
] as const;
