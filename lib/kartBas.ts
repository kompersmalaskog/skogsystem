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
// Skarp (Flygfoto: Ljus, se nedan): flygfoto ljus 0,93 och mättnad −0,09, de andra ljus ~0,96 och mättnad ~−0,09. `KARTBAS_PAINT` är det som gäller utan eget val.
import { KARTLAGER, type Kartlager } from './kartlager';

export type RasterPaint = Record<string, number>;

/** Dämpad (0): dagens nivå från Kartan lugnare. */
export const KARTBAS_DAMPAD: Record<Kartlager, RasterPaint> = {
  // Flygfoto (Lantmäteriets ortofoto): ungefär HALVA ljusstyrkan och avmättat så vägar, gräns och symboler lyser direkt. Mörkast: ortofotot har de ljusaste ytorna (åker, hygge, grusväg).
  satellite: { 'raster-brightness-min': 0, 'raster-brightness-max': 0.5, 'raster-contrast': 0.05, 'raster-saturation': -0.6 },
  // Karta (Lantmäteriet topowebb, redan ljus och tyst): ned i ljus och färg, ljus bakgrund bakom.
  lantmateriet: { 'raster-brightness-max': 0.72, 'raster-contrast': -0.06, 'raster-saturation': -0.6, 'raster-opacity': 0.9 },
  // Topokarta (LM full färg) och OpenStreetMap: samma nedtoning som Karta.
  terrain: { 'raster-brightness-max': 0.72, 'raster-contrast': -0.04, 'raster-saturation': -0.55 },
  osm: { 'raster-brightness-max': 0.72, 'raster-contrast': -0.04, 'raster-saturation': -0.55 },
  // Ritad: skogsbilden ur laserdatan (lib/ritadKarta). Den är redan mörk och lugn, så Dämpad tar bara ned den lite.
  ritad: { 'raster-brightness-max': 0.7, 'raster-contrast': 0, 'raster-saturation': -0.4 },
  // Mörk (Tesla, lib/ritadKarta/mork): samma skogsbild som Ritad men nästan svart — trakten (det avverkade) är ljusast, skogen bara en aning.
  mork: { 'raster-brightness-max': 0.18, 'raster-contrast': 0, 'raster-saturation': -0.7 },
};

/** Skarp (100): ingen nedtoning — samma egenskaper som Dämpad så att varje nyckel kan interpoleras. */
export const KARTBAS_SKARP: Record<Kartlager, RasterPaint> = {
  satellite: { 'raster-brightness-min': 0, 'raster-brightness-max': 1, 'raster-contrast': 0, 'raster-saturation': 0 },
  lantmateriet: { 'raster-brightness-max': 1, 'raster-contrast': 0, 'raster-saturation': 0, 'raster-opacity': 1 },
  terrain: { 'raster-brightness-max': 1, 'raster-contrast': 0, 'raster-saturation': 0 },
  osm: { 'raster-brightness-max': 1, 'raster-contrast': 0, 'raster-saturation': 0 },
  ritad: { 'raster-brightness-max': 1, 'raster-contrast': 0, 'raster-saturation': 0 },
  // Mörk är mörk också i Skarp: reglaget avgör hur mycket av skogen som syns, aldrig en ljus karta.
  mork: { 'raster-brightness-max': 0.45, 'raster-contrast': 0.05, 'raster-saturation': -0.35 },
};

/** Reglagets standard för de bakgrunder som saknar Ljus: nästan Skarp. */
export const KARTBAS_STANDARD_STYRKA = 85;

// LJUS — ett steg förbi Skarp, bara för Flygfoto (Martin 2026-11-22: flygfotot upplevdes mörkt och suddigt jämfört med FL).
// Samma reglage, ingen ny knapp: 0 = Dämpad, 100 = Skarp, 120 = Ljus. Mellan Skarp och Ljus interpoleras som mellan Dämpad och Skarp.
// Ljus = skuggorna lyfta (raster-brightness-min: svart blir 10 % grått — mörka granbestånd går att läsa), kontrasten lite högre (motverkar att lyftet ger
// slöja) och mättnaden lite högre. Toppen rörs inte (brightness-max 1): en grusväg eller ett hygge blir aldrig ljusare än i Skarp, och kontrasten är så låg
// att ingenting klipper — mätt på riktiga rutor (Gallring Santhe, Tröjemåla-hygget, Lidhem): 0 % klippta pixlar, hyggets 95:e percentil +19 %, skuggornas 5:e +35 %.
// Andra bakgrunder har inget Ljus (maxstyrka 100). Flygfotots Dämpad och Skarp bär brightness-min 0 så att reglaget alltid sätter tillbaka den när man drar bort från Ljus.
export const KARTBAS_LJUS: Partial<Record<Kartlager, RasterPaint>> = {
  satellite: { 'raster-brightness-min': 0.1, 'raster-brightness-max': 1, 'raster-contrast': 0.12, 'raster-saturation': 0.12 },
};

/** Reglagets högsta värde per bakgrund: 100 (Skarp), men Flygfoto har Ljus på 120. */
export const KARTBAS_MAX_STYRKA: Record<Kartlager, number> = { satellite: 120, lantmateriet: 100, terrain: 100, osm: 100, ritad: 100, mork: 100 };

/** Reglagets standard per bakgrund: Flygfoto = Ljus (högsta steget), övriga nästan Skarp. */
export const kartBasStandard = (lager: Kartlager): number => (KARTBAS_LJUS[lager] ? KARTBAS_MAX_STYRKA[lager] : KARTBAS_STANDARD_STYRKA);

/** Styrkan klamrad till bakgrundens egna spann (0 till dess maxvärde). Skräp ger bakgrundens standard. */
export const klamKartBasStyrka = (lager: Kartlager, v: number): number =>
  Number.isFinite(v) ? Math.min(KARTBAS_MAX_STYRKA[lager], Math.max(0, v)) : kartBasStandard(lager);
const tva = (x: number): number => Math.round(x * 100) / 100;
// MapLibres grundvärden: en nyckel som bara finns i Ljus (brightness-min) börjar där när den interpoleras från Skarp.
const RASTER_GRUND: RasterPaint = { 'raster-brightness-min': 0, 'raster-brightness-max': 1, 'raster-contrast': 0, 'raster-saturation': 0, 'raster-opacity': 1 };

/** Lagrets raster-paint för ett kartlager vid en viss styrka (0 = Dämpad, 100 = Skarp, över 100 = mot Ljus där det finns). Alltid en ny kopia — ingen kan ändra konstanterna av misstag. */
export function kartBasPaint(lager: Kartlager, styrka: number = kartBasStandard(lager)): RasterPaint {
  const st = klamKartBasStyrka(lager, styrka);
  const ljus = KARTBAS_LJUS[lager];
  const ut: RasterPaint = {};
  if (ljus && st > 100) {
    const t = (st - 100) / (KARTBAS_MAX_STYRKA[lager] - 100);
    const a = KARTBAS_SKARP[lager];
    for (const k of Object.keys(ljus)) ut[k] = tva((a[k] ?? RASTER_GRUND[k]) + (ljus[k] - (a[k] ?? RASTER_GRUND[k])) * t);
    return ut;
  }
  const t = st / 100;
  const a = KARTBAS_DAMPAD[lager];
  const b = KARTBAS_SKARP[lager];
  for (const k of Object.keys(a)) ut[k] = tva(a[k] + (b[k] - a[k]) * t);
  return ut;
}

/** Det som gäller utan eget val (standardstyrkan). */
export const KARTBAS_PAINT: Record<Kartlager, RasterPaint> = Object.fromEntries(KARTLAGER.map((l) => [l, kartBasPaint(l)])) as Record<Kartlager, RasterPaint>;

/** Körvyns bakgrund under kartrutorna: syns bara där en ruta inte hunnit komma. Dämpad mörk skogston (som ett flygfoto av skog) i stället
 *  för nästan svart — en saknad ruta ska se ut som skog som laddar, inte som ett hål i kartan (Martin 2026-11-03: "svarta ytor"). */
export const KORVY_BAKGRUND = '#3b4236';
