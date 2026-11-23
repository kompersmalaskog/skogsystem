// Hur uppföljningen skriver tal och tid — samma som resten av appen.
// Tal med decimalkomma ("12,3"), tid som "3 h 49 min" (lib/flytt/traillertid
// fmtTid). Inga "12.3" och inga "4.2h" i vyn (Martin 2026-11-23).
import { fmtTid } from '@/lib/flytt/traillertid';

/** "12,3", "1 044". Högst `dec` decimaler, svensk stil. */
export function tal(n: number, dec = 1): string {
  return n.toLocaleString('sv-SE', { maximumFractionDigits: dec });
}

/** Timmar (decimaltal) → "3 h 49 min". */
export function tidH(h: number): string {
  return fmtTid(h * 60);
}

/** Sekunder → "3 h 49 min". */
export function tidSek(sek: number): string {
  return fmtTid(sek / 60);
}
