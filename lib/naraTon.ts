// Skotarläget: skarpt nära maskinen, lugnt längre bort (Martin 2026-11-06, "som Tesla").
// Tre ringar mörkt ovanpå bakgrund, ytor, spår och vägar — staplade ger de en mjuk övergång. Linjer man ska vara rädd om
// (kraftledning, stenmur …), symboler, högar och larmplatsen ligger ovanpå (lib/lagerOrdning) och är alltid fulla.
import { FARG } from './design/tokens';

export const NARA_TON_LAGER = 'skotar-nara-ton';
export const NARA_TON_KALLA = 'skotar-nara-ton-source';
export const NARA_TON_FARG = FARG.bg;
/** Radie (m) och hur mycket mörkt varje ring lägger till utanför sig. 0,15 × 3 ≈ 39 % mörkare längst bort. */
export const NARA_RINGAR: readonly { radieM: number; op: number }[] = [
  { radieM: 120, op: 0.15 }, { radieM: 220, op: 0.15 }, { radieM: 350, op: 0.15 },
];
/** Ringarna ritas om först när maskinen flyttat så här långt. */
export const NARA_FLYTT_M = 15;

type LL = [number, number];
const VARLD: LL[] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];

export function cirkel(lat: number, lng: number, radieM: number, n = 48): LL[] {
  const dLat = radieM / 111_320, dLng = radieM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ut: LL[] = [];
  for (let i = 0; i <= n; i++) { const a = (2 * Math.PI * i) / n; ut.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]); }
  // hålets ring åt andra hållet än världens (moturs/medurs) så att det blir ett hål
  return ut.reverse();
}

/** Ytan: en feature per ring = hela världen med ett hål runt maskinen. Utan position: tom. */
export function naraTonYta(pos: { lat: number; lng: number } | null): GeoJSON.FeatureCollection {
  if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: NARA_RINGAR.map((r) => ({ type: 'Feature', properties: { op: r.op }, geometry: { type: 'Polygon', coordinates: [VARLD, cirkel(pos.lat, pos.lng, r.radieM)] } })),
  };
}

/** Meter mellan två punkter (litet avstånd, plan). */
export function meterMellan(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dy = (a.lat - b.lat) * 111_320, dx = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}
