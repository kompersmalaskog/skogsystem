// Throttle/dedup för kompass-heading (deviceorientation). deviceorientation fyrar ~60 Hz på iOS —
// utan gate kördes setDeviceHeading 60 ggr/sek → 60 re-renders/sek av planeringsvyn OCH (i körvy)
// 60 easeTo/sek på kameran (korvyHeading = gpsHeading ?? deviceHeading). Batteri-fix (#PR):
// emitera ny heading BARA om det gått ≥ KOMPASS_MIN_MS sedan förra (max 10 Hz) OCH headingen ändrats
// mer än KOMPASS_MIN_GRADER (kortaste vägen). Stilla kompass (jitter < 3°) → ingen uppdatering alls.

export const KOMPASS_MIN_MS = 100;        // max 10 Hz
export const KOMPASS_MIN_GRADER = 3;      // minsta verkliga ändring

/** Absolut headingskillnad (0–180°) kortaste vägen mellan två 0–360-vinklar. */
export function headingDiffGrader(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * Ska en ny heading emitteras (dvs setDeviceHeading anropas)? Throttlad till minMs OCH kräver en
 * verklig ändring > minGrader mot senast emitterade heading. Första fixen (sisteRaw == null) släpps
 * alltid igenom. Ren funktion → testbar (räkna emits/sek före/efter).
 */
export function skaEmittaHeading(
  ny: number,
  sisteRaw: number | null,
  nu: number,
  sisteTs: number,
  minMs: number = KOMPASS_MIN_MS,
  minGrader: number = KOMPASS_MIN_GRADER,
): boolean {
  if (sisteRaw == null) return true;
  if (nu - sisteTs < minMs) return false;
  return headingDiffGrader(ny, sisteRaw) > minGrader;
}
