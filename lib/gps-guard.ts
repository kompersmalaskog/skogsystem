/**
 * GPS-sparningens vakt — DELAD för alla GPS-sparade linjetyper (basväg, stenmur, dike, stickväg).
 *
 * Problem: ofiltrerade GPS-fixar (hopp vid dålig mottagning, brus) ritades som vägsegment där
 * föraren aldrig gick — "framför honom" och grenar åt sidan. Accuracy-grinden litade på enhetens
 * rapporterade noggrannhet (optimistisk i skog) och det fanns bara ett UNDRE avståndskrav, aldrig
 * ett övre → ett 30 m-hopp passerade och ritades.
 *
 * Vakten kastar bruspunkter och orimliga hopp INNAN de når det glidande medlet (gpsHistoryRef) och
 * den ritade pathen. Trösklarna sitter här — ETT ställe, tunbara.
 */
export const GPS_GUARD = {
  accuracyMaxM: 15, // sämre rapporterad noggrannhet → släpp (behåller dagens 15 m-krav)
  minStepM: 2,      // närmare än så från senast accepterade → brus, släpp
  maxSpeedMps: 8,   // snabbare än rimlig gång/maskintakt (gång ~1.5, maskin ~1–3 m/s) → hopp, släpp
} as const

export interface GpsFix { lat: number; lon: number; ts: number; accuracy: number }
export interface GpsAccepted { lat: number; lon: number; ts: number }

/** Haversine-avstånd i meter (self-contained — ingen komponent-beroende, testbar). */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Ren vakt: ska en rå fix få gå vidare till historik + path?
 * `last` = senast ACCEPTERADE punkten (lat/lon/ts). last=null → första punkten (bara accuracy gäller).
 *
 * Självläkning: en AVVISAD punkt uppdaterar INTE `last` (anroparens ansvar). När Δt sedan växer
 * (t.ex. GPS tappas och återfås 20 m bort på riktigt) sjunker den beräknade hastigheten under taket
 * och punkten släpps in igen — vakten låser alltså inte ute alla följande punkter permanent.
 */
export function gpsGuardAccepts(cand: GpsFix, last: GpsAccepted | null): boolean {
  // 1. Osäker fix — enhetens rapporterade noggrannhet för dålig (eller saknas).
  if (!Number.isFinite(cand.accuracy) || cand.accuracy > GPS_GUARD.accuracyMaxM) return false
  // 2. Första punkten: inget att jämföra mot → accuracy räcker.
  if (!last) return true
  const stepM = haversineMeters(last.lat, last.lon, cand.lat, cand.lon)
  // 3. För nära senast accepterade → brus (står i princip stilla).
  if (stepM < GPS_GUARD.minStepM) return false
  // 4. Orimlig hastighet sedan senast accepterade → hopp.
  const dtSec = Math.max((cand.ts - last.ts) / 1000, 0.001)
  if (stepM / dtSec > GPS_GUARD.maxSpeedMps) return false
  return true
}
