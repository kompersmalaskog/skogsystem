import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

// Dieselförbrukning per månad för Lastbilsvyns "Vad drar den?" + trenden.
// Ren diesel (AdBlue har ingen litermätare → redovisas inte som förbrukning).
// Summerar flyttdag per månad, delat på flytt (avslutad m. maskin) vs övrig
// körning. Login-gatead, läser via service-role. Kraschar aldrig.
//
// OBS: dubbelrundor (samma vin/starttid) dubbelräknas tills datarättningen
// landat — samma reservation som resten av vyn; rättas i separat PR.

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
// l/mil bara när det finns BÅDE sträcka och bränsle — 0 l = saknad data (t.ex.
// äldre rundor utan bränslemätning), inte "kör utan diesel".
function lPerMil(km: number, l: number): number | null {
  return km > 0 && l > 0 ? Math.round((l / (km / 10)) * 100) / 100 : null
}

export async function GET() {
  if (!(await inloggad())) return NextResponse.json({ ok: false, fel: 'ej inloggad' }, { status: 401 })

  const db = admin()
  const { data: fd } = await db.from('flyttdag')
    .select('starttid, status, matare_km, bransle_l').order('starttid', { ascending: true })

  type M = { mil: number; diesel_l: number; fl_km: number; fl_l: number; ov_km: number; ov_l: number }
  const mån = new Map<string, M>()
  for (const d of fd ?? []) {
    const km = tal(d.matare_km), l = tal(d.bransle_l)
    if (!d.starttid || km == null) continue           // rundor utan mätdata bidrar inte
    const nyckel = String(d.starttid).slice(0, 7)      // YYYY-MM
    const m = mån.get(nyckel) ?? { mil: 0, diesel_l: 0, fl_km: 0, fl_l: 0, ov_km: 0, ov_l: 0 }
    const flytt = d.status === 'avslutad'
    m.mil += km / 10; m.diesel_l += (l ?? 0)
    if (flytt) { m.fl_km += km; m.fl_l += (l ?? 0) } else { m.ov_km += km; m.ov_l += (l ?? 0) }
    mån.set(nyckel, m)
  }

  const manader = Array.from(mån.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))            // nyaste först
    .map(([manad, m]) => ({
      manad,
      mil: Math.round(m.mil * 10) / 10,
      diesel_l: Math.round(m.diesel_l),
      l_per_mil: lPerMil(m.mil * 10, m.diesel_l),
      flytt: { mil: Math.round(m.fl_km / 10 * 10) / 10, diesel_l: Math.round(m.fl_l), l_per_mil: lPerMil(m.fl_km, m.fl_l) },
      ovrig: { mil: Math.round(m.ov_km / 10 * 10) / 10, diesel_l: Math.round(m.ov_l), l_per_mil: lPerMil(m.ov_km, m.ov_l) },
    }))

  return NextResponse.json({ ok: true, manader })
}
