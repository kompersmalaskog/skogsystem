// Delad serverside-modul mot Scanias rFMS. Nycklarna (SCANIA_CLIENT_ID /
// SCANIA_CLIENT_SECRET) läses ENBART ur process.env och får aldrig nå
// klientsidan — importera bara denna fil i route-handlers, aldrig i en
// klientkomponent.
//
// Auth = Scanias HMAC-SHA256 challenge/response (verifierat mot
// way-platform/rfms-go). Accept-dialekten är rFMS 4.0-specens exakta form
// "application/json; rfms=<resurs>.v4.0".
//
// Scania blockerar ALDRIG appen: varje anrop har timeout och returnerar null
// vid fel. Anroparen visar då tomt/utelämnar — aldrig en spinner som väntar.

import crypto from 'crypto'

const AUTH_BASE = 'https://dataaccess.scania.com/auth'
const RFMS_BASE = 'https://dataaccess.scania.com/rfms4'
const TIMEOUT_MS = 4000
const STATUS_CACHE_MS = 60_000   // tankkortet: högst ett Scania-varv per minut
const TOKEN_MARGINAL_MS = 5 * 60_000  // förnya token 5 min före utgång (giltig ~1 h)

export interface FordonsStatus {
  vin: string | null
  namn: string | null                       // customerVehicleName om satt (t.ex. "0048")
  createdDateTime: string | null            // ISO — när mätvärdet skapades i fordonet
  odometer_m: number | null                 // hrTotalVehicleDistance, METER
  fuel_pct: number | null                   // fuelLevel1
  adblue_pct: number | null                 // catalystFuelLevel
  rackvidd_m: number | null                 // estimatedDistanceToEmpty, METER
}

/** fetch med hård timeout — en hängande Scania-server får aldrig blockera. */
async function fetchTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' })
  } finally {
    clearTimeout(t)
  }
}

// ── Token-cache (giltig ~1 h; delas mellan anrop i samma serverless-instans) ──
let tokenCache: { token: string; utgang: number } | null = null

async function hamtaToken(): Promise<string | null> {
  const clientId = process.env.SCANIA_CLIENT_ID
  const clientSecret = process.env.SCANIA_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  if (tokenCache && Date.now() < tokenCache.utgang) return tokenCache.token

  try {
    // 1. clientId → challenge
    const r1 = await fetchTimeout(`${AUTH_BASE}/clientid2challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ clientId }),
    })
    if (!r1.ok) return null
    const challenge: string | undefined = (await r1.json())?.challenge
    if (!challenge) return null

    // 2. response = base64url( HMAC-SHA256(secret, challenge) ), allt base64url-avkodat först
    const response = crypto
      .createHmac('sha256', Buffer.from(clientSecret, 'base64url'))
      .update(Buffer.from(challenge, 'base64url'))
      .digest('base64url')

    // 3. response → token
    const r2 = await fetchTimeout(`${AUTH_BASE}/response2token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ clientId, Response: response }),
    })
    if (!r2.ok) return null
    const token: string | undefined = (await r2.json())?.token
    if (!token) return null

    tokenCache = { token, utgang: Date.now() + 60 * 60_000 - TOKEN_MARGINAL_MS }
    return token
  } catch {
    return null
  }
}

/** Plocka ut de fält vi bryr oss om, oavsett om de ligger på toppnivå eller i
 *  snapshotData (rFMS lägger odometer på toppen, tank/räckvidd i snapshot). */
function tolka(rad: any): FordonsStatus {
  const snap = rad?.snapshotData ?? {}
  const tal = (v: any) => (Number.isFinite(v) ? Number(v) : null)
  return {
    vin: rad?.vin ?? null,
    namn: rad?.customerVehicleName ?? rad?.vehicleName ?? null,
    createdDateTime: rad?.createdDateTime ?? rad?.receivedDateTime ?? null,
    odometer_m: tal(rad?.hrTotalVehicleDistance ?? snap?.hrTotalVehicleDistance),
    fuel_pct: tal(snap?.fuelLevel1 ?? rad?.fuelLevel1),
    adblue_pct: tal(snap?.catalystFuelLevel ?? rad?.catalystFuelLevel),
    rackvidd_m: tal(snap?.estimatedDistanceToEmpty ?? rad?.estimatedDistanceToEmpty),
  }
}

// ── Statuscache (tankkortet) ──
let statusCache: { tid: number; data: FordonsStatus } | null = null

/**
 * Senaste vehiclestatus för lastbilen. `farsk: true` går förbi cachen
 * (används för odometern som styr en mätning); annars återanvänds ett svar
 * upp till en minut (tankkortet, som kan visas ofta).
 *
 * Returnerar null vid saknade nycklar, fel eller timeout — anroparen visar
 * då tomt. Kastar aldrig.
 */
export async function senasteFordonsstatus(opts?: { farsk?: boolean }): Promise<FordonsStatus | null> {
  if (!opts?.farsk && statusCache && Date.now() - statusCache.tid < STATUS_CACHE_MS) {
    return statusCache.data
  }
  const token = await hamtaToken()
  if (!token) return null
  try {
    const r = await fetchTimeout(`${RFMS_BASE}/vehiclestatuses?latestOnly=true`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json; rfms=vehiclestatuses.v4.0' },
    })
    if (!r.ok) return null
    const body = await r.json()
    const rader: any[] = body?.vehicleStatusResponse?.vehicleStatuses ?? body?.vehicleStatuses ?? []
    if (!rader.length) return null
    // En lastbil idag. Skulle flera dyka upp: nyaste createdDateTime vinner.
    const nyast = rader.reduce((a, b) =>
      (Date.parse(b?.createdDateTime ?? '') || 0) > (Date.parse(a?.createdDateTime ?? '') || 0) ? b : a)
    const data = tolka(nyast)
    statusCache = { tid: Date.now(), data }
    return data
  } catch {
    return null
  }
}

/** Är mätvärdet äldre än `minuter` minuter? Okänd tid → behandlas som gammalt. */
export function arGammal(createdDateTime: string | null, minuter = 30): boolean {
  const t = createdDateTime ? Date.parse(createdDateTime) : NaN
  if (!Number.isFinite(t)) return true
  return Date.now() - t > minuter * 60_000
}
