// MÖRK — "Tesla-kartan" (Martin 2026-11-06, bild A: "kan du göra tesla kartan också det kanske är någon som vill prova den").
//
// Ett eget val i + › Lager › Bakgrundskarta, bredvid Flygfoto, Karta, Topokarta, OpenStreetMap och Ritad. Det är SAMMA ritade karta som Ritad
// (samma lager, källor, laserdata, blött och brant — lib/ritadKarta/lager, lib/hooks/useRitadKarta), bara i en mörk drägt:
//   • nästan svart botten, vatten mörkblått, hus knappt synliga
//   • terrängen syns som ljus på sluttningarna mot solen (skuggor syns inte på svart)
//   • vägarna ljusgrå med svart kant — de lyser, men tävlar inte med snitseln, faran eller symbolerna
//   • skogen ur laserdatan nästan svart (lib/kartBas: `mork`), så det avverkade är det ljusaste — trakten syns först
// Allt man planerar (snitsel, symboler, larm, högar, spår) ritas likadant som på de andra bakgrunderna. Ingen standard: bara den som väljer Mörk ser den.
//
// `MORK_PAINT` ersätter paint-värden på den ritade kartans lager medan Mörk är vald; `ritadPaint` är originalet (ur lagerspecarna), som sätts
// tillbaka när man byter till Ritad. Ingen annan del av appen får färga om den ritade kartans lager (vakt: lib/ritadKarta/mork.test.ts).

import { MORK_BAKGRUND } from './stil';
import { RITAD_DIKE_ID, RITAD_ID, RITAD_NVDB_ID, blottLager, brantLager, grundLager } from './lager';

export { MORK_BAKGRUND };

export const MORK_PAINT: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  [RITAD_ID.bakgrund]: { 'background-color': MORK_BAKGRUND },
  [RITAD_ID.relief]: {
    'hillshade-shadow-color': ['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.6)'],
    'hillshade-highlight-color': ['rgba(200,215,235,0.05)', 'rgba(200,215,235,0.09)', 'rgba(200,215,235,0.14)', 'rgba(200,215,235,0.09)'],
  },
  'ritad-vatten': { 'fill-color': '#0f2536' },
  'ritad-vattendrag': { 'line-color': '#1f4a68' },
  'ritad-hus': { 'fill-color': '#1d2026' },
  'ritad-vag-kant': { 'line-color': '#000000' },
  'ritad-vag': { 'line-color': ['match', ['get', 'class'], ['track', 'path', 'service'], '#6e7075', '#a3a5aa'] },
  [RITAD_NVDB_ID.kant]: { 'line-color': '#000000' },
  [RITAD_NVDB_ID.vag]: { 'line-color': ['match', ['get', 'k'], 'stor', '#a3a5aa', '#6e7075'] },
  [RITAD_DIKE_ID.kant]: { 'line-color': '#000000' },
  [RITAD_DIKE_ID.dike]: { 'line-color': '#3b7ea8' },
};

/** Ritads ursprungliga paint-värde för varje egenskap Mörk ändrar — ur lagerspecarna, så de aldrig kan glida isär. */
export function ritadPaint(): Record<string, Record<string, unknown>> {
  const alla = [...grundLager(), ...brantLager(), ...blottLager()];
  const ut: Record<string, Record<string, unknown>> = {};
  for (const [id, p] of Object.entries(MORK_PAINT)) {
    const l = alla.find((x: any) => x.id === id) as any;
    if (!l) continue;
    ut[id] = {};
    for (const k of Object.keys(p)) ut[id][k] = l.paint?.[k];
  }
  return ut;
}

/** Sätter drägten på kartan: Mörk eller Ritad. Lager som inte finns hoppas över. */
export function sattDragt(map: any, mork: boolean): void {
  const p = mork ? MORK_PAINT : ritadPaint();
  for (const [id, egen] of Object.entries(p)) {
    if (!map?.getLayer?.(id)) continue;
    for (const [k, v] of Object.entries(egen)) { try { map.setPaintProperty(id, k, v); } catch { /* */ } }
  }
}

/** Den ritade kartans grundlager i Mörks drägt — för kartan utan valt objekt (lib/objektKarta tomKartaStil). */
export function morkGrundLager(): any[] {
  return grundLager().map((l: any) => (MORK_PAINT[l.id] ? { ...l, paint: { ...(l.paint ?? {}), ...MORK_PAINT[l.id] } } : l));
}
