// PRODUKTIONSHÖGARNA SOM PRICKAR (skotar-hogar-dots + skotar-hogar-halv i planeringen och skotarläget).
// Martin 2026-11-06 (bild J och K): högarna i trädslagets HELA färg, lika tätt som i verkligheten, större prick = mer virke kvar, och större när man
// zoomar in. En blandad hög ritas halv–halv: pricken i det största trädslagets färg och en halv skiva (SDF-bild, färgen ur datan) ovanpå i det andra.

/**
 * Högens radie i px (zoom × kvar volym): större hög = större prick, och större när man zoomar in (Martin 2026-11-06, bild J: "lite större
 * inzoomat", lika tätt som i verkligheten). `skala` gör samma uttryck till ikonstorlek för den halva skivan.
 */
export function hogRadie(skala: number): unknown[] {
  const steg = (par: number[]) => ['interpolate', ['linear'], ['get', 'v'], ...par.map((x, i) => (i % 2 ? x * skala : x))];
  return ['interpolate', ['linear'], ['zoom'],
    // Golvet höjt 2026-11-13 (Martin: "dom små är för små, man ser knappt dom"): minsta pricken är 4 px bred utzoomat (var 2), 6 på trakten, 8 nära.
    13, steg([0, 2, 2, 2.5, 10, 3.5, 30, 5]),
    17, steg([0, 3, 1, 3.8, 5, 5.5, 15, 8, 40, 10.5]),
    19, steg([0, 4, 1, 5, 5, 7.5, 15, 11, 40, 14])];
}
export const HOG_HALV_BILD = 'skotar-hog-halv';
export const HOG_HALV_PX = 64;
export const HOG_HALV_RADIE_PX = 30;
/** Höger halva av en skiva som SDF (alfa 192 på kanten, som MapLibres egna), så icon-color sätter trädslagets färg. */
export function hogHalvBild(): { width: number; height: number; data: Uint8ClampedArray } {
  const W = HOG_HALV_PX, c = W / 2, data = new Uint8ClampedArray(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const px = x + 0.5 - c, py = y + 0.5 - c;
    const d = Math.min(HOG_HALV_RADIE_PX - Math.hypot(px, py), px);   // > 0 inne i halvan
    const i = (y * W + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.max(0, Math.min(255, Math.round(192 + d * 24)));
  }
  return { width: W, height: W, data };
}
