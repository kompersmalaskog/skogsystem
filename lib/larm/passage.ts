// PASSAGE PÅ PLANERAD VÄG genom en förbjuden yta (Martin 2026-10-28, Skälviken RP J-Hus -25).
//
// Skotaren körde basvägen genom Vidas Hänsyn 6 varje dag och fick det stora kortet "Hänsyn – Du är inne i ytan, kör inte här" varje gång. Planeraren har RITAT vägen
// genom ytan: där ska maskinen köra. Ett larm som alltid går på en planerad väg lär föraren att larmet inte betyder något — och då trycker han bort det också när det gäller.
//
// Regeln: står maskinen på en planerad väg (planeringens basväg eller stickväg) inne i en förbjuden yta → inget stort kort, inget ljud, bara en liten rad
// "Passage genom Hänsyn 6". Kör maskinen AV vägen men är kvar i ytan kommer det riktiga larmet som förut (kort + ljud).
// Röd fara (Ej framkomlig) rörs aldrig, oavsett väg. Bara förbjudna ytor påverkas. Fällningscirkeln och kvittensen rörs inte.
//
// TOLERANS 7 m: GPS-felet är 2–3 m i median och upp till ~8 m (uppmätt på Skälviken), maskinen är ~3 m bred (halva bredden ~1,5 m) och vägen är ritad för hand på en karta.
// 7 m täcker nästan hela GPS-spridningen plus halva maskinen; mer än så och en maskin som kört ut i ytan bredvid vägen skulle räknas som "på vägen".
// HYSTERES +4 m (av vägen först vid 11 m): samma princip som övriga larm (lib/larm HYSTERES_*), så GPS-brus kring 7 m inte slår av och på kort och ljud.

import { avstandTillLinjeM, type LatLon } from './geo';
import { arVagTyp } from '../backvag';

/** På vägen: inom så många meter från närmaste punkt på en planerad väg. */
export const PASSAGE_VAG_M = 7;
/** Av vägen först när avståndet överstiger toleransen + hysteresen. */
export const PASSAGE_HYSTERES_M = 4;

/** Planerad väg = planeringens basväg (alla färgval) och stickvägar. Dike, stig, stenmur, traktgräns m.fl. är inga vägar. */
export const arPlaneradVag = (lineType: unknown): boolean => arVagTyp(lineType);

/** Avstånd i meter till närmaste planerade väg. Inga vägar = oändligt långt bort. */
export function avstandTillPlaneradVagM(pos: LatLon, vagar: ReadonlyArray<readonly LatLon[]>): number {
  let min = Infinity;
  for (const v of vagar) {
    if (v.length < 2) continue;
    const d = avstandTillLinjeM(pos, v);
    if (d < min) min = d;
  }
  return min;
}

/** Står maskinen på en planerad väg? På vid ≤ 7 m, av först vid > 11 m (hysteres). */
export function stegaPaVag(prev: boolean, avstandM: number): boolean {
  if (!Number.isFinite(avstandM)) return false;
  return avstandM <= (prev ? PASSAGE_VAG_M + PASSAGE_HYSTERES_M : PASSAGE_VAG_M);
}

/** Radens text. Namnet är ytans bricka ("Hänsyn 6"), samma som kartans etikett och instruktionskortet (lib/ytaNamn). */
export const passageText = (namn: string): string => `Passage genom ${namn}`;
