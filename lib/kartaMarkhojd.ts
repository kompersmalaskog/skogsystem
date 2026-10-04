// Kamerans markhöjd i 3D-terräng. Pricken ska stå där körvyns padding lägger den (nedre tredjedelen) — oavsett markens höjd.
//
// MapLibre håller kamerans centerhöjd (`getCenterElevation`) lika med terrängens höjd i centrum, men FRYSER den medan en
// kameraanimation (easeTo/flyTo) pågår och släpper den inte efteråt om animationen inte bad om det. Landar flygningen innan
// höjddata-rutorna (DEM) kommit blir centerhöjden kvar på 0 m; när DEM:en sedan laddas rättas inget → centrumpunkten ligger
// markhöjden × sin(lutning) för högt på skärmen (Hålabäck, 97 m, zoom 17,5, pitch 28°: pricken på 25 % från toppen i stället
// för 60 %). En STILLASTÅENDE position (testfliken) får ingen följ-tick som rättar det. `jumpTo({ elevation })` sätter höjden direkt.
//
// Rena funktioner (kartan som parameter) → enhetstestbara med en fejk.

/** Hur många meter centerhöjden får avvika från markhöjden innan vi rättar den (DEM-brus ryms inom detta). */
export const MARKHOJD_TOL_M = 1.5;

/** Hur ofta körvyn kontrollerar centerhöjden (ms). Händelserna idle/moveend kommer inte alltid efter att höjddatan laddats. */
export const MARKHOJD_KONTROLL_MS = 700;

/** Rätta kamerans centerhöjd till markhöjden i centrum. Returnerar true om en rättning gjordes.
 *  Rör ALDRIG kameran medan den rör sig (jumpTo avbryter animationen), och gör inget utan 3D-terräng eller utan laddad höjddata. */
export function jamkaMarkhojd(map: any, tol: number = MARKHOJD_TOL_M): boolean {
  try {
    if (!map || !map.getTerrain?.()) return false;
    if (map.isMoving?.()) return false;
    const h = map.queryTerrainElevation?.(map.getCenter());
    if (typeof h !== 'number' || !Number.isFinite(h)) return false;          // höjddata för centrum ej laddad än
    const nu = map.getCenterElevation?.();
    if (typeof nu !== 'number' || Math.abs(nu - h) <= tol) return false;    // redan rätt
    map.jumpTo({ elevation: h });
    return true;
  } catch { return false; }
}
