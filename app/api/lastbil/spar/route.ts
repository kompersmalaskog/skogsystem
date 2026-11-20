import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { matchaSpar } from '@/lib/sparMatchning'

// GPS-spåret för EN vald runda (Lastbilsvyns block 4 → rita på kartan i block 1).
// Punkterna = lastbil_logg i rundans tidsfönster (starttid…sluttid, vin-matchat).
// Login-gatead, läser via service-role. Kraschar aldrig.

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

export async function GET(req: NextRequest) {
  if (!(await inloggad())) return NextResponse.json({ ok: false, fel: 'ej inloggad' }, { status: 401 })

  const rundaId = req.nextUrl.searchParams.get('runda')
  if (!rundaId) return NextResponse.json({ ok: false, fel: 'runda saknas' }, { status: 400 })

  const db = admin()
  const { data: dagar } = await db.from('flyttdag')
    .select('id, vin, starttid, sluttid').eq('id', rundaId).limit(1)
  const dag = dagar?.[0]
  if (!dag) return NextResponse.json({ ok: false, fel: 'runda finns inte' }, { status: 404 })

  // Aktiv lastbil som fallback om rundan saknar vin (äldre manuella rundor)
  let vin: string | null = dag.vin ?? null
  if (!vin) {
    const { data: bilar } = await db.from('lastbil').select('vin').eq('aktiv', true).limit(1)
    vin = bilar?.[0]?.vin ?? null
  }
  if (!vin || !dag.starttid) return NextResponse.json({ ok: true, spar: [], segment: [], nagonOmatchad: false, matchningPa: false })

  const till = dag.sluttid ?? new Date().toISOString()
  const { data: pkt } = await db.from('lastbil_logg')
    .select('tidpunkt, lat, lng')
    .eq('vin', vin).gte('tidpunkt', dag.starttid).lte('tidpunkt', till)
    .order('tidpunkt', { ascending: true })
  const spar = (pkt ?? [])
    .filter(p => p.lat != null && p.lng != null)
    .map(p => ({ lat: Number(p.lat), lng: Number(p.lng), t: p.tidpunkt }))

  // Map-matcha spåret längs vägnätet (chunkat, cachat per runda). Kraschar
  // aldrig — vid fel/utan ORS-nyckel ritas raka dämpade segment i stället.
  const { segment, nagonOmatchad, matchningPa } = await matchaSpar(db, rundaId, spar.map(p => ({ lat: p.lat, lng: p.lng })))

  return NextResponse.json({ ok: true, spar, segment, nagonOmatchad, matchningPa })
}
