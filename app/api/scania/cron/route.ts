import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hamtaStatusRatt, loggFalt } from '@/lib/scania'

// Bakgrundsmotorn (STEG 1): var 5:e minut → en rå vehiclestatus från Scania →
// en rad i lastbil_logg (dedupe på vin+tidpunkt, så samma avläsning aldrig
// blir två rader). Behåller rådata + rate-limit-headers för insyn.
//
// Scheduler-agnostisk: Vercel-cron (skickar Authorization: Bearer $CRON_SECRET
// automatiskt när CRON_SECRET är satt) ELLER extern trigger (x-cron-secret).
// Utan CRON_SECRET kör den ALDRIG — aldrig en oskyddad datainsamlings-endpoint.
//
// Ingen rundlogik än (STEG 2). Kraschar aldrig: Scania-fel → rapporteras,
// loggen får en lucka, inget mer.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function auktoriserad(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false  // ingen hemlighet satt → vägra hellre än att stå öppen
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true  // Vercel-cron
  if (req.headers.get('x-cron-secret') === secret) return true              // extern trigger
  return false
}

async function kor(req: NextRequest) {
  if (!auktoriserad(req)) {
    return NextResponse.json({ ok: false, error: 'ej auktoriserad' }, { status: 401 })
  }

  const res = await hamtaStatusRatt()
  if (!res) {
    return NextResponse.json({ ok: false, steg: 'auth', note: 'Scania-nycklar saknas i miljön' }, { status: 200 })
  }

  const rapport: Record<string, any> = {
    ok: true,
    httpStatus: res.httpStatus,
    rateLimit: res.rateLimit,          // Scanias rate-limit-headers (för att se taket)
    hamtadTid: res.hamtadTid,
  }

  // Oväntat svar (429/5xx/timeout) → rapportera, skriv inget, krascha aldrig
  if (res.httpStatus !== 200 || !res.rad) {
    rapport.ok = false
    rapport.note = res.httpStatus === 429 ? 'rate limited' : `inget användbart svar (${res.httpStatus})`
    return NextResponse.json(rapport, { status: 200 })
  }

  const f = loggFalt(res.rad)
  // Bekräftar i praktiken att statuses bär position/fart/bränsle
  rapport.falt = {
    harPosition: f.lat != null && f.lng != null,
    harFart: f.hastighet != null,
    harOdometer: f.odometer_m != null,
    harBransle: f.bransle_ml != null,
    tidpunkt: f.tidpunkt,
  }

  if (!f.vin || !f.tidpunkt) {
    rapport.skrivet = false
    rapport.note = 'raden saknar vin/tidpunkt — hoppar skrivning'
    return NextResponse.json(rapport, { status: 200 })
  }

  const { data, error } = await supabase.from('lastbil_logg')
    .upsert({
      vin: f.vin,
      tidpunkt: f.tidpunkt,
      lat: f.lat,
      lng: f.lng,
      hastighet: f.hastighet,
      odometer_m: f.odometer_m,
      bransle_ml: f.bransle_ml,
      radata: { rfms: res.rad, rateLimit: res.rateLimit },
    }, { onConflict: 'vin,tidpunkt', ignoreDuplicates: true })
    .select('id')

  if (error) {
    rapport.ok = false
    rapport.skrivet = false
    rapport.skrivFel = error.message
  } else {
    rapport.skrivet = (data?.length ?? 0) > 0
    if (!rapport.skrivet) rapport.dedupe = 'samma avläsning fanns redan (Scania har inte uppdaterat sedan förra cykeln)'
  }
  return NextResponse.json(rapport, { status: 200 })
}

export async function GET(req: NextRequest) { return kor(req) }
export async function POST(req: NextRequest) { return kor(req) }
