// GPS-strömmen till appen: högst EN uppdatering per sekund.
//
// Fynd 2026-10-24: `lib/gpsKalla.ts` anropade `onFix` för VARJE giltig NMEA-rad (GGA, RMC, GSA, GSV …), och appen satte `currentPosition` till ett nytt objekt
// för varje. En multi-GNSS-mottagare (Quectel via Eltima, se "GPS-källa" i CLAUDE.md) skickar tiotals rader i sekunden, så sidan omrenderades lika ofta och
// skotarlägets fixbuffert (tak 3 000) var full på en minut — lassens spår blev ~1 minut långa. Nu släpps en ny fix igenom först när det gått STRYP_MS sedan
// förra, eller när fixens status ändras (giltig ↔ ogiltig, fördröjd) — då går den igenom direkt så att "fix tappad" aldrig försenas.
export const STRYP_MS = 1000

export interface StrypState { senastMs: number | null; giltig: boolean | null; fordrojd: boolean | null }
export const nyStryp = (): StrypState => ({ senastMs: null, giltig: null, fordrojd: null })

export function skaNotifiera(s: StrypState, fix: { giltig: boolean; fordrojd?: boolean }, nuMs: number): { notifiera: boolean; state: StrypState } {
  const andrad = s.giltig !== fix.giltig || s.fordrojd !== !!fix.fordrojd
  const gammal = s.senastMs == null || nuMs - s.senastMs >= STRYP_MS || nuMs < s.senastMs
  if (!andrad && !gammal) return { notifiera: false, state: s }
  return { notifiera: true, state: { senastMs: nuMs, giltig: fix.giltig, fordrojd: !!fix.fordrojd } }
}
