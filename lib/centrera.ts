// CENTRERA-KNAPPEN — EN regel för körvyn och planeringsvyn.
//
//  Körvyn:      kartan FÖLJER maskinen → knappen dold. Drar föraren i kartan pausas följningen → knappen syns. Tryck → följning igen.
//  Planeringen: ingen följning. Knappen dold när kartan STÅR på användarens position; drar man bort kartan syns den.
//               Tryck → centrera EN gång på positionen (kartan står då på den → knappen döljs). Ingen kontinuerlig följning.
//
// Rena funktioner (kartan som parameter) → enhetstestbara utan webbläsare.

/** Så nära kartans mitt (skärm-pixlar) måste positionen ligga för att kartan räknas "stå på" den. */
export const CENTRERA_PX = 48;

/** Ligger positionens skärmpunkt inom `px` från kartans mitt? Kartans mitt = `getCenter()` (i MapLibre den GEOGRAFISKA mitten av
 *  den paddade ytan — alltså där körvyn lägger pricken), så padding räknas rätt. Saknas karta/position → true (inget att centrera). */
export function arKartanPaPositionen(
  map: { project(l: [number, number]): { x: number; y: number }; getCenter(): { lng: number; lat: number } } | null | undefined,
  pos: { lat: number; lon: number } | null | undefined,
  px: number = CENTRERA_PX,
): boolean {
  if (!map || !pos) return true;
  try {
    const c = map.getCenter();
    const mitt = map.project([c.lng, c.lat]);
    const p = map.project([pos.lon, pos.lat]);
    if (![mitt.x, mitt.y, p.x, p.y].every(Number.isFinite)) return true;
    return Math.hypot(p.x - mitt.x, p.y - mitt.y) <= px;
  } catch { return true; }
}

/** Ska knappen synas? Utan position finns inget att centrera på → dold i båda vyerna. */
export function centreraKnappSynlig(a: {
  korvy: boolean;                 // körvyn öppen
  harPosition: boolean;           // en position finns (fix, utlagd eller simulerad)
  foljningPausad: boolean;        // körvyn: föraren har dragit i kartan
  kartaFranPosition: boolean;     // planeringen: kartan står inte på positionen
}): boolean {
  if (!a.harPosition) return false;
  return a.korvy ? a.foljningPausad : a.kartaFranPosition;
}
