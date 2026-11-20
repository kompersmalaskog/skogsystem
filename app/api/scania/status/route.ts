import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import crypto from 'crypto'

// FÖRSTA PROVANROP mot Scania rFMS (developer.scania.com, klient
// "skogsystem-maskinflytt"). Läser BARA — inga DB-skrivningar, ingen UI.
//
// Nycklarna (SCANIA_CLIENT_ID / SCANIA_CLIENT_SECRET) läses enbart ur
// process.env på servern och når ALDRIG klientsidan. Route:n är dessutom
// inloggnings-gatead (middleware släpper /api/* rått → egen auth här), så
// den kan inte anropas anonymt på deploymenten.
//
// Auth-flödet är Scanias HMAC-SHA256 challenge/response, verifierat mot
// referensimplementationen way-platform/rfms-go (auth_scania.go):
//   1. POST /auth/clientid2challenge  (form: clientId)      → { challenge }
//   2. response = base64url( HMAC-SHA256( key=base64url⁻¹(secret),
//                                         msg=base64url⁻¹(challenge) ) )
//   3. POST /auth/response2token      (form: clientId, Response) → { token }
//   4. rFMS GET med  Authorization: Bearer <token>

export const runtime = 'nodejs'         // crypto krävs
export const dynamic = 'force-dynamic'  // aldrig cacha ett provanrop

const AUTH_BASE = 'https://dataaccess.scania.com/auth'
const RFMS_BASE = 'https://dataaccess.scania.com/rfms4'

/** Kräver giltig Supabase-session — middleware släpper /api/* rått igenom. */
async function inloggad() {
  const cs = await cookies()
  const c = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cs.getAll() }, setAll() { /* read-only här */ } } },
  )
  const { data: { user } } = await c.auth.getUser()
  return !!user
}

/** Klipp långa råsvar men behåll tillräckligt för en ärlig rapport. */
function klipp(s: string, n = 4000) {
  return s.length > n ? s.slice(0, n) + `\n…(+${s.length - n} tecken)` : s
}

/** Läs svaret som JSON om möjligt, annars rå text — rapportera alltid rått. */
async function las(r: Response) {
  const text = await r.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* icke-JSON, behåll text */ }
  return {
    status: r.status,
    ok: r.ok,
    contentType: r.headers.get('content-type'),
    json,
    text: json ? undefined : klipp(text),
  }
}

/** Steg 1–3: challenge → HMAC → token. Kastar ett strukturerat fel med
 *  exakt vilket steg som brast och råsvaret. */
async function hamtaToken(clientId: string, clientSecret: string) {
  // 1. clientId → challenge
  const r1 = await fetch(`${AUTH_BASE}/clientid2challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ clientId }),
    cache: 'no-store',
  })
  const s1 = await las(r1)
  if (!r1.ok || !s1.json?.challenge) {
    throw { steg: 'clientid2challenge', ...s1 }
  }
  const challenge: string = s1.json.challenge

  // 2. response = base64url( HMAC-SHA256(secret, challenge) ), allt base64url utan padding
  const nyckel = Buffer.from(clientSecret, 'base64url')
  const meddelande = Buffer.from(challenge, 'base64url')
  const response = crypto.createHmac('sha256', nyckel).update(meddelande).digest('base64url')

  // 3. response → token
  const r2 = await fetch(`${AUTH_BASE}/response2token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ clientId, Response: response }),
    cache: 'no-store',
  })
  const s2 = await las(r2)
  if (!r2.ok || !s2.json?.token) {
    throw { steg: 'response2token', ...s2 }
  }
  return { token: s2.json.token as string, refreshToken: s2.json.refreshToken ?? null }
}

/** Accept-kandidater per rFMS-resurs. rFMS 4.0-specen (V4.0.0, 2021-09-17)
 *  visar exakt "application/json; rfms=<resurs>.v4.0" — den provas först.
 *  Övriga är fallback ifall Scanias server vill ha en annan dialekt
 *  (vnd.fmsstandard-varianten, eller den .v4 vi först skickade som gav 406). */
function kandidater(resurs: string): string[] {
  const Resurs = resurs.charAt(0).toUpperCase() + resurs.slice(1)
  return [
    `application/json; rfms=${resurs}.v4.0`,
    `application/json; rfms=${resurs}.v4`,
    `application/vnd.fmsstandard.com.${Resurs}.v4.0+json`,
    `application/vnd.fmsstandard.com.${resurs}.v4.0+json`,
  ]
}

/** Ett rFMS-anrop som provar Accept-kandidaterna i tur och ordning tills en
 *  INTE ger 406 (fel Accept-dialekt). 200/403/annat = servern accepterade
 *  dialekten → sluta prova och rapportera det svaret. */
async function rfms(path: string, token: string, accepts: string[]) {
  const forsok: { accept: string; status: number }[] = []
  let sista: Awaited<ReturnType<typeof las>> & { accept: string } = { accept: '', status: 0, ok: false, contentType: null, json: null, text: undefined }
  for (const accept of accepts) {
    const r = await fetch(`${RFMS_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: accept },
      cache: 'no-store',
    })
    const s = await las(r)
    forsok.push({ accept, status: s.status })
    sista = { accept, ...s }
    if (s.status !== 406) break  // 406 = fel Accept → nästa kandidat; annat = accepterad dialekt
  }
  return { path, forsok, ...sista }
}

/** Vilka fält en rad faktiskt bär (topp-nivå + ett steg ner) — så rapporten
 *  visar position/odometer/bränsle/tidsstämplar utan att tolka värdena. */
function faltKarta(obj: any): string[] {
  if (!obj || typeof obj !== 'object') return []
  const ut: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      ut.push(`${k}: { ${Object.keys(v).join(', ')} }`)
    } else {
      ut.push(k)
    }
  }
  return ut
}

export async function GET() {
  if (!(await inloggad())) {
    return NextResponse.json({ ok: false, error: 'Ej inloggad — öppna i webbläsaren medan du är inloggad' }, { status: 401 })
  }

  const clientId = process.env.SCANIA_CLIENT_ID
  const clientSecret = process.env.SCANIA_CLIENT_SECRET
  const rapport: any = {
    tidpunkt: new Date().toISOString(),
    env: {
      SCANIA_CLIENT_ID: clientId ? `satt (${clientId.length} tecken, …${clientId.slice(-4)})` : 'SAKNAS',
      SCANIA_CLIENT_SECRET: clientSecret ? `satt (${clientSecret.length} tecken)` : 'SAKNAS',
    },
  }

  if (!clientId || !clientSecret) {
    rapport.ok = false
    rapport.slutsats = 'Miljövariablerna finns inte i den här miljön — kör mot en Vercel-deployment (Production/Preview), inte localhost.'
    return NextResponse.json(rapport, { status: 200 })
  }

  // ── Auth ──
  let token: string
  try {
    const t = await hamtaToken(clientId, clientSecret)
    token = t.token
    rapport.auth = { ok: true, tokenLangd: token.length, refreshToken: t.refreshToken ? 'ja' : 'nej' }
  } catch (e: any) {
    rapport.ok = false
    rapport.auth = { ok: false, felVidSteg: e?.steg ?? 'okänt', status: e?.status, svar: e?.json ?? e?.text ?? String(e) }
    rapport.slutsats = `Autentiseringen brast vid "${e?.steg}" (HTTP ${e?.status}). ` +
      'Ett 4xx här är nycklar/klientkonfiguration; kolla att SCANIA_CLIENT_SECRET är exakt "Secret key"-strängen (base64url) utan extra tecken.'
    return NextResponse.json(rapport, { status: 200 })
  }

  // ── rFMS: fordonslista ──
  const vehicles = await rfms('/vehicles', token, kandidater('vehicles'))
  rapport.vehicles = {
    status: vehicles.status, contentType: vehicles.contentType,
    acceptForsok: vehicles.forsok, valdAccept: vehicles.accept,
    svar: vehicles.json ?? vehicles.text,
  }
  const fordon: any[] = vehicles.json?.vehicleResponse?.vehicles ?? vehicles.json?.vehicles ?? []
  if (fordon.length) {
    rapport.vehicles.antal = fordon.length
    rapport.vehicles.vins = fordon.map(v => v?.vin ?? v?.vehicleId ?? '(okänt id)')
    rapport.vehicles.faltPerFordon = faltKarta(fordon[0])
  }

  // ── rFMS: senaste position + status (odometer m.m.) för alla fordon ──
  const positions = await rfms('/vehiclepositions?latestOnly=true', token, kandidater('vehiclepositions'))
  const posRader: any[] = positions.json?.vehiclePositionResponse?.vehiclePositions ?? positions.json?.vehiclePositions ?? []
  rapport.vehiclepositions = {
    status: positions.status, contentType: positions.contentType,
    acceptForsok: positions.forsok, valdAccept: positions.accept,
    antal: posRader.length,
    faltPerRad: posRader.length ? faltKarta(posRader[0]) : [],
    exempel: posRader[0] ?? positions.json ?? positions.text,
  }

  const statuses = await rfms('/vehiclestatuses?latestOnly=true', token, kandidater('vehiclestatuses'))
  const statRader: any[] = statuses.json?.vehicleStatusResponse?.vehicleStatuses ?? statuses.json?.vehicleStatuses ?? []
  rapport.vehiclestatuses = {
    status: statuses.status, contentType: statuses.contentType,
    acceptForsok: statuses.forsok, valdAccept: statuses.accept,
    antal: statRader.length,
    faltPerRad: statRader.length ? faltKarta(statRader[0]) : [],
    exempel: statRader[0] ?? statuses.json ?? statuses.text,
  }

  rapport.ok = vehicles.ok
  rapport.slutsats = vehicles.ok
    ? `Auth OK. Accept-dialekt som funkade: "${vehicles.accept}". ${fordon.length} fordon i listan. Positioner: HTTP ${positions.status} (${posRader.length} rader). Status/odometer: HTTP ${statuses.status} (${statRader.length} rader). Se faltPerRad/exempel för exakt vilka fält som levereras.`
    : vehicles.status === 406
      ? `Auth OK men alla Accept-kandidater gav 406 på /vehicles. Se vehicles.acceptForsok för vad som provades — nästa steg är att läsa serverns råsvar (vehicles.svar) för vilken media-typ den vill ha.`
      : `Auth OK men /vehicles gav HTTP ${vehicles.status} med Accept "${vehicles.accept}" — troligen behörighet ("not entitled"). Råsvaret ligger i vehicles.svar.`

  return NextResponse.json(rapport, { status: 200 })
}
