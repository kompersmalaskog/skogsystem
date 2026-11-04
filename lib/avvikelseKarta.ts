// Avvikelserna på kartan: EN röd romb med kryss per avvikelse — samma tecken som egenkontrollens avvikelse (lib/observationIkon),
// så att det betyder samma sak överallt. En avvikelse som väntar i kön (inte skickad än) ritas halvgenomskinlig.
//
// Lagrets id börjar på `markers-`: följer med in i körvyn (KEEP_PREFIX) och ligger bland symbolerna i lagerordningen (lib/lagerOrdning).

import { observationBildNamn, ritaObservationIkon, OBS_PIXELRATIO } from './observationIkon';

export const AVVIKELSE_KALLA = 'avvikelse-source';
export const AVVIKELSE_LAGER = 'markers-avvikelse';
const BILD = observationBildNamn('avvikelse');

export interface AvvikelsePunkt { id: string; lat: number; lng: number; vantar: boolean }

export function avvikelseFeatures(lista: readonly AvvikelsePunkt[]) {
  return {
    type: 'FeatureCollection' as const,
    features: lista
      .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng))
      .map((a) => ({ type: 'Feature' as const, properties: { id: a.id, vantar: a.vantar ? 1 : 0 }, geometry: { type: 'Point' as const, coordinates: [a.lng, a.lat] } })),
  };
}

export function avvikelseLagerSpec(): any {
  return {
    id: AVVIKELSE_LAGER, type: 'symbol', source: AVVIKELSE_KALLA,
    layout: { 'icon-image': BILD, 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': 1 },
    paint: { 'icon-opacity': ['case', ['==', ['get', 'vantar'], 1], 0.55, 1] },
  };
}

/** Lägger till eller uppdaterar källan, bilden och lagret. Tål att stilen byts (läggs till igen). */
export function ritaAvvikelser(map: any, lista: readonly AvvikelsePunkt[]): void {
  if (!map?.isStyleLoaded?.() && !map?.getStyle?.()) return;
  try {
    if (!map.hasImage(BILD)) map.addImage(BILD, ritaObservationIkon('avvikelse') as any, { pixelRatio: OBS_PIXELRATIO });
    const data = avvikelseFeatures(lista);
    const src = map.getSource(AVVIKELSE_KALLA);
    if (src) src.setData(data);
    else map.addSource(AVVIKELSE_KALLA, { type: 'geojson', data });
    if (!map.getLayer(AVVIKELSE_LAGER)) map.addLayer(avvikelseLagerSpec());
  } catch { /* stilen laddas om — nästa uppdatering lägger till igen */ }
}
