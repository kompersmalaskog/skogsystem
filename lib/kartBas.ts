// BAKGRUNDSKARTAN TONAS NER — EN källa för alla fyra bakgrundslager (Kartan lugnare, 2026-10-24).
//
// Förut var bara Flygfoto och Karta nedtonade, och Topokarta och OpenStreetMap ritades i full styrka: en gul snitsel på en ljus åker eller en vit
// vägkant på OSM hade nästan ingen kontrast mot bakgrunden. Nu får ALLA fyra samma behandling — mörkare och gråare, så vägar, gränser och symboler
// (som bär betydelsen) syns tydligt och bakgrunden är underlag, inte huvudsak. Planeringsvyns mapStyleConfig och kartan utan valt objekt
// (lib/objektKarta tomKartaStil) läser härifrån; vakt: lib/kartBas.test.ts.
//
// Värdena är MapLibres raster-egenskaper (deterministiska per pixel), så ändringen går att mäta på vilken bild som helst (kartBas.hytt.test.ts).
//   raster-brightness-max   vitt blir grått: 1 = oförändrat, 0,55 = ett vitt tile-pixelvärde blir 55 % ljust
//   raster-saturation       −1 = helt grått, 0 = oförändrat
//   raster-contrast         0 = oförändrat; ett lågt värde plattar ut bilden så den inte tävlar med linjerna
import type { Kartlager } from './kartlager';

export type RasterPaint = Record<string, number>;

export const KARTBAS_PAINT: Record<Kartlager, RasterPaint> = {
  // Flygfoto (Lantmäteriets ortofoto). Mörkast: ortofotot har de ljusaste ytorna (åker, hygge, grusväg) — där försvinner en gul/vit linje annars.
  satellite: { 'raster-brightness-max': 0.55, 'raster-contrast': 0.05, 'raster-saturation': -0.5 },
  // Karta (Lantmäteriet topowebb, redan ljus och tyst): ned i ljus och färg, ljus bakgrund bakom.
  lantmateriet: { 'raster-brightness-max': 0.72, 'raster-contrast': -0.06, 'raster-saturation': -0.6, 'raster-opacity': 0.9 },
  // Topokarta (LM full färg) och OpenStreetMap: förut orörda — nu samma nedtoning som Karta.
  terrain: { 'raster-brightness-max': 0.72, 'raster-contrast': -0.04, 'raster-saturation': -0.55 },
  osm: { 'raster-brightness-max': 0.72, 'raster-contrast': -0.04, 'raster-saturation': -0.55 },
};

/** Lagrets raster-paint för ett kartlager (en kopia, så ingen kan ändra konstanten av misstag). */
export const kartBasPaint = (lager: Kartlager): RasterPaint => ({ ...KARTBAS_PAINT[lager] });
