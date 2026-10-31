// BAKGRUNDSKARTAN — EN källa för alla fyra bakgrundslager (Kartan lugnare 2026-10-24, Kartan tydligare 2026-10-27).
//
// Förut var bara Flygfoto och Karta nedtonade, och Topokarta och OpenStreetMap ritades i full styrka: en gul snitsel på en ljus åker eller en vit
// vägkant på OSM hade nästan ingen kontrast mot bakgrunden. Nu får ALLA fyra samma behandling — mörkare och gråare, så vägar, gränser och symboler
// (som bär betydelsen) syns tydligt och bakgrunden är underlag, inte huvudsak. Planeringsvyns mapStyleConfig och kartan utan valt objekt
// (lib/objektKarta tomKartaStil) läser härifrån; vakt: lib/kartBas.test.ts.
//
// Värdena är MapLibres raster-egenskaper (deterministiska per pixel), så ändringen går att mäta på vilken bild som helst (kartBas.hytt.test.ts).
//   raster-brightness-max   vitt blir grått: 1 = oförändrat, 0,5 = ett vitt tile-pixelvärde blir 50 % ljust
//   raster-saturation       −1 = helt grått, 0 = oförändrat
//   raster-contrast         0 = oförändrat; ett lågt värde plattar ut bilden så den inte tävlar med linjerna
//
// TVÅ ÄNDPUNKTER OCH ETT REGLAGE (Martin 2026-10-27: kartorna var för grå och döda):
//   Dämpad = nivån från Kartan lugnare (#963): mörkare och gråare, så vägar, gränser och symboler bär.
//   Skarp  = ingen nedtoning alls (ljus 1, mättnad 0, kontrast 0, full opacitet).
// Reglaget "Dämpad ↔ Skarp" (0–100, steg 5) i + › Lager väljer läget mellan dem, per bakgrund och per enhet (lib/kartReglage). Standard 85 = nästan
// Skarp: flygfoto ljus 0,93 och mättnad −0,09, de andra ljus ~0,96 och mättnad ~−0,09. `KARTBAS_PAINT` är det som gäller utan eget val.
import { KARTLAGER, type Kartlager } from './kartlager';

export type RasterPaint = Record<string, number>;

/** Dämpad (0): dagens nivå från Kartan lugnare. */
export const KARTBAS_DAMPAD: Record<Kartlager, RasterPaint> = {
  // Flygfoto (Lantmäteriets ortofoto): ungefär HALVA ljusstyrkan och avmättat så vägar, gräns och symboler lyser direkt. Mörkast: ortofotot har de ljusaste ytorna (åker, hygge, grusväg).
  satellite: { 'raster-brightness-max': 0.5, 'raster-contrast': 0.05, 'raster-saturation': -0.6 },
  // Karta (Lantmäteriet topowebb, redan ljus och tyst): ned i ljus och färg, ljus bakgrund bakom.
  lantmateriet: { 'raster-brightness-max': 0.72, 'raster-contrast': -0.06, 'raster-saturation': -0.6, 'raster-opacity': 0.9 },
  // Topokarta (LM full färg) och OpenStreetMap: samma nedtoning som Karta.
  terrain: { 'raster-brightness-max': 0.72, 'raster-contrast': -0.04, 'raster-saturation': -0.55 },
  osm: { 'raster-brightness-max': 0.72, 'raster-contrast': -0.04, 'raster-saturation': -0.55 },
  // Ritad: skogsbilden ur laserdatan (lib/ritadKarta). Den är redan mörk och lugn, så Dämpad tar bara ned den lite.
  ritad: { 'raster-brightness-max': 0.7, 'raster-contrast': 0, 'raster-saturation': -0.4 },
};

/** Skarp (100): ingen nedtoning — samma egenskaper som Dämpad så att varje nyckel kan interpoleras. */
export const KARTBAS_SKARP: Record<Kartlager, RasterPaint> = {
  satellite: { 'raster-brightness-max': 1, 'raster-contrast': 0, 'raster-saturation': 0 },
  lantmateriet: { 'raster-brightness-max': 1, 'raster-contrast': 0, 'raster-saturation': 0, 'raster-opacity': 1 },
  terrain: { 'raster-brightness-max': 1, 'raster-contrast': 0, 'raster-saturation': 0 },
  osm: { 'raster-brightness-max': 1, 'raster-contrast': 0, 'raster-saturation': 0 },
  ritad: { 'raster-brightness-max': 1, 'raster-contrast': 0, 'raster-saturation': 0 },
};

/** Reglagets standard: nästan Skarp. */
export const KARTBAS_STANDARD_STYRKA = 85;

const klamStyrka = (v: number): number => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : KARTBAS_STANDARD_STYRKA);
const tva = (x: number): number => Math.round(x * 100) / 100;

/** Lagrets raster-paint för ett kartlager vid en viss styrka (0 = Dämpad, 100 = Skarp). Alltid en ny kopia — ingen kan ändra konstanterna av misstag. */
export function kartBasPaint(lager: Kartlager, styrka: number = KARTBAS_STANDARD_STYRKA): RasterPaint {
  const t = klamStyrka(styrka) / 100;
  const a = KARTBAS_DAMPAD[lager];
  const b = KARTBAS_SKARP[lager];
  const ut: RasterPaint = {};
  for (const k of Object.keys(a)) ut[k] = tva(a[k] + (b[k] - a[k]) * t);
  return ut;
}

/** Det som gäller utan eget val (standardstyrkan). */
export const KARTBAS_PAINT: Record<Kartlager, RasterPaint> = Object.fromEntries(KARTLAGER.map((l) => [l, kartBasPaint(l)])) as Record<Kartlager, RasterPaint>;
