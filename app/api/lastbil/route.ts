import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { haversine } from '@/utils/geo'

// Överblick för Lastbilsvyn (/lastbil). Läser BARA — allt kommer ur det cron:en
// redan sparar: lastbil_logg (position + radata.rfms = hela råa vehiclestatus-
// raden var 5:e min) och flyttdag. Ingen live-Scania-call behövs, ingen migration.
//
// Login-gatead (middleware släpper /api/* rått → egen Supabase-auth här).
// Läsningen går via service-role så RLS på lastbil_logg/flyttdag inte spelar in.
//
// Kraschar ALDRIG: saknat fält → hamnar i `saknas[]`, aldrig ett undantag som
// fäller vyn. Scania-princip: tomt/utelämnat är alltid bättre än en trasig sida.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function inloggad() {
  const cs = await cookies()
  const c = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cs.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await c.auth.getUser()
  return !!user
}

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const tal = (v: any) => (Number.isFinite(v) ? Number(v) : null)
/** estimatedDistanceToEmpty är i rFMS 4.0 ett objekt {fuel,total} (meter),
 *  äldre/andra fordon kan skicka ett tal. Tåla båda. */
function rackviddM(v: any): number | null {
  if (v && typeof v === 'object') return tal(v.total ?? v.fuel)
  return tal(v)
}

// tellTale-koder → begriplig svenska. Fallback prettifierar okänd kod.
const LAMP_NAMN: Record<string, string> = {
  ENGINE_MIL_INDICATOR: 'Motorlampa (MIL)',
  ENGINE_EMISSION_FAILURE: 'Utsläppssystem',
  ENGINE_OIL: 'Motorolja',
  ENGINE_OIL_LEVEL: 'Motoroljenivå',
  ENGINE_OIL_TEMPERATURE: 'Motoroljetemperatur',
  ENGINE_COOLANT_TEMPERATURE: 'Kylvätsketemperatur',
  ENGINE_COOLANT_LEVEL: 'Kylvätskenivå',
  BRAKE_MALFUNCTION: 'Bromsfel',
  ANTI_LOCK_BRAKE_FAILURE: 'ABS-fel',
  EBS: 'EBS (bromssystem)',
  RETARDER: 'Retarder',
  TRANSMISSION_MALFUNCTION: 'Växellådsfel',
  TRANSMISSION_FLUID_TEMPERATURE: 'Växellådstemperatur',
  BATTERY_CHARGING_CONDITION: 'Batteriladdning',
  GENERAL_FAILURE: 'Allmänt fel',
}
function lampNamn(kod: string): string {
  return LAMP_NAMN[kod]
    ?? kod.toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

export async function GET() {
  if (!(await inloggad())) return NextResponse.json({ ok: false, fel: 'ej inloggad' }, { status: 401 })

  const db = admin()
  const saknas: string[] = []

  // Aktiv lastbil (ett fordon idag; vin styr all filtrering)
  const { data: bilar } = await db.from('lastbil').select('vin, namn, hemmabas_lat, hemmabas_lng, hemmabas_radie_m').eq('aktiv', true).limit(1)
  const vin: string | null = bilar?.[0]?.vin ?? null
  if (!vin) {
    return NextResponse.json({ ok: true, harData: false, position: null, tank: null, halsa: null,
      spar_idag: [], runda_pagar: false, rundor: [], saknas: ['aktiv lastbil'] })
  }

  // Senaste loggrad — position ur kolumnerna, allt annat ur råa radata.rfms
  const { data: sen } = await db.from('lastbil_logg')
    .select('tidpunkt, lat, lng, radata')
    .eq('vin', vin).order('tidpunkt', { ascending: false }).limit(1)
  const senaste = sen?.[0] ?? null

  if (!senaste) {
    return NextResponse.json({ ok: true, harData: false, position: null, tank: null, halsa: null,
      spar_idag: [], runda_pagar: false, rundor: [], saknas: ['loggpunkter'] })
  }

  const rad: any = senaste.radata?.rfms ?? senaste.radata ?? {}
  const snap: any = rad?.snapshotData ?? {}
  const up: any = rad?.uptimeData ?? {}

  const alder_min = senaste.tidpunkt
    ? Math.max(0, Math.round((Date.now() - Date.parse(senaste.tidpunkt)) / 60000))
    : null
  const position = (senaste.lat != null && senaste.lng != null)
    ? { lat: Number(senaste.lat), lng: Number(senaste.lng), tidpunkt: senaste.tidpunkt, alder_min }
    : null
  if (!position) saknas.push('position')

  // ── Kan jag köra (tank) ──
  const diesel_pct = tal(snap.fuelLevel1 ?? rad.fuelLevel1)
  const adblue_pct = tal(snap.catalystFuelLevel ?? rad.catalystFuelLevel)
  const rackvidd_m = rackviddM(snap.estimatedDistanceToEmpty ?? rad.estimatedDistanceToEmpty)
  const rackvidd_km = rackvidd_m != null ? Math.round(rackvidd_m / 1000) : null
  if (diesel_pct == null) saknas.push('diesel')
  if (adblue_pct == null) saknas.push('AdBlue')
  if (rackvidd_km == null) saknas.push('räckvidd')
  const tank = { diesel_pct, adblue_pct, rackvidd_km }

  // ── Mår den bra (hälsa) ──
  const tellTales: any[] = Array.isArray(up.tellTaleInfo) ? up.tellTaleInfo : []
  const harLampor = tellTales.length > 0
  const tand = (s: string) => s && s !== 'OFF' && s !== 'NOT_AVAILABLE'
  const lampor = tellTales
    .filter(t => tand(t?.state))
    .map(t => ({ kod: t.tellTale, namn: lampNamn(String(t.tellTale ?? '')), state: t.state }))
  const service_km = tal(up.serviceDistance) != null ? Math.round(Number(up.serviceDistance) / 1000) : null
  const matare_km = tal(rad.hrTotalVehicleDistance) != null ? Math.round(Number(rad.hrTotalVehicleDistance) / 1000) : null
  const motortimmar = tal(rad.totalEngineHours) != null ? Math.round(Number(rad.totalEngineHours)) : null
  if (!harLampor) saknas.push('varningslampor')
  if (service_km == null) saknas.push('service')
  if (motortimmar == null) saknas.push('motortimmar')
  const halsa = { har_lampor: harLampor, lampor, service_km, matare_km, motortimmar }

  // ── Var är den: dagens spår ──
  const idag = new Date(); idag.setHours(0, 0, 0, 0)
  const { data: pkt } = await db.from('lastbil_logg')
    .select('tidpunkt, lat, lng')
    .eq('vin', vin).gte('tidpunkt', idag.toISOString())
    .order('tidpunkt', { ascending: true })
  const spar_idag = (pkt ?? [])
    .filter(p => p.lat != null && p.lng != null)
    .map(p => ({ lat: Number(p.lat), lng: Number(p.lng), t: p.tidpunkt }))

  // Pågår en runda just nu? (öppen flyttdag för bilen — auto eller manuell)
  const { data: oppna } = await db.from('flyttdag')
    .select('id').is('sluttid', null).or(`vin.eq.${vin},vin.is.null`).limit(1)
  const oppen_runda_id: string | null = oppna?.[0]?.id ?? null
  const runda_pagar = oppen_runda_id != null

  // ── Läge: kör (öppen runda + ev. maskin på flaket) / parkerad på hemmabasen ──
  const bas = {
    lat: tal(bilar?.[0]?.hemmabas_lat), lng: tal(bilar?.[0]?.hemmabas_lng),
    radie_km: (tal(bilar?.[0]?.hemmabas_radie_m) ?? 300) / 1000,
  }
  let oppen_runda: {
    id: string; starttid: string | null; live_km: number | null
    maskin: { namn: string; lage: 'flaket' | 'lossad' } | null
  } | null = null
  let parkerad: { plats: string; sedan: string | null } | null = null

  if (oppen_runda_id) {
    const { data: rd } = await db.from('flyttdag')
      .select('starttid, start_odometer_m').eq('id', oppen_runda_id).maybeSingle()
    const startOdo = tal(rd?.start_odometer_m)
    // Live-km = senaste odometer − rundans start (mätt, aldrig interpolerat)
    const live_km = (startOdo != null && matare_km != null)
      ? Math.max(0, Math.round(matare_km - startOdo / 1000)) : null
    // Senaste flytt i rundan → maskin på flaket (sluttid null) eller lossad (sluttid satt)
    const { data: mf } = await db.from('maskin_flytt')
      .select('maskin_id, extern_maskin, sluttid').eq('flyttdag_id', oppen_runda_id).eq('avbruten', false)
      .order('starttid', { ascending: false }).limit(1)
    let maskin: { namn: string; lage: 'flaket' | 'lossad' } | null = null
    const f = mf?.[0]
    if (f) {
      let namn: string = f.extern_maskin || f.maskin_id || 'Maskin'
      if (f.maskin_id) {
        const { data: dm } = await db.from('dim_maskin')
          .select('visningsnamn, modell').eq('maskin_id', f.maskin_id).maybeSingle()
        namn = dm?.visningsnamn || dm?.modell || f.maskin_id
      }
      maskin = { namn, lage: f.sluttid ? 'lossad' : 'flaket' }
    }
    oppen_runda = { id: oppen_runda_id, starttid: rd?.starttid ?? null, live_km, maskin }
  } else if (bas.lat != null && bas.lng != null && position) {
    const iRadie = (la: number, ln: number) => haversine(la, ln, bas.lat!, bas.lng!) <= bas.radie_km
    const fart = tal(snap.wheelBasedSpeed ?? snap.gnssPosition?.speed)
    const stilla = fart == null || fart <= 2
    if (iRadie(position.lat, position.lng) && stilla) {
      // Parkerad sedan = första punkten i den pågående hemma-sviten (walk baklänges)
      const { data: pk } = await db.from('lastbil_logg')
        .select('tidpunkt, lat, lng').eq('vin', vin).order('tidpunkt', { ascending: false }).limit(80)
      let sedan: string | null = position.tidpunkt
      for (const p of (pk ?? [])) {
        if (p.lat != null && p.lng != null && iRadie(Number(p.lat), Number(p.lng))) sedan = p.tidpunkt
        else break
      }
      parkerad = { plats: 'LBC', sedan }
    }
  }

  // ── Vad har den gjort: senaste ~10 rundor ──
  const { data: fdag } = await db.from('flyttdag')
    .select('id, starttid, sluttid, status, matare_km, bransle_l')
    .order('starttid', { ascending: false }).limit(10)
  const dagar = fdag ?? []
  // Flytt-antal per runda → typ (flytt vs övrig körning) utan N+1
  const ids = dagar.map(d => d.id)
  let flyttPerDag = new Map<string, number>()
  if (ids.length) {
    const { data: flyttar } = await db.from('maskin_flytt')
      .select('flyttdag_id').in('flyttdag_id', ids).eq('avbruten', false).not('sluttid', 'is', null)
    for (const f of flyttar ?? []) flyttPerDag.set(f.flyttdag_id, (flyttPerDag.get(f.flyttdag_id) ?? 0) + 1)
  }
  const rundor = dagar.map(d => {
    const antalFlytt = flyttPerDag.get(d.id) ?? 0
    const typ = d.sluttid == null ? 'pagar' : (antalFlytt > 0 ? 'flytt' : 'ovrig')
    const km = tal(d.matare_km)
    const l = tal(d.bransle_l)
    const l_per_mil = (km != null && km > 0 && l != null) ? Math.round((l / (km / 10)) * 10) / 10 : null
    return {
      id: d.id, starttid: d.starttid, sluttid: d.sluttid, typ, antal_flytt: antalFlytt,
      matare_km: km, bransle_l: l, l_per_mil,
    }
  })

  return NextResponse.json({
    ok: true, harData: true, vin, namn: bilar?.[0]?.namn ?? null,
    position, tank, halsa, spar_idag, runda_pagar, oppen_runda_id, oppen_runda, parkerad, rundor, saknas,
  })
}
