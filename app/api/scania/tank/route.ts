import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { senasteFordonsstatus } from '@/lib/scania'

// Tankstatus för lastbilskortet på maskinlistan. CACHAD ~60 s serverside
// (lib/scania.ts) — inte ett Scania-anrop per sidvisning. Login-gatead.
// Fel/timeout/saknad data → { ok:false } → klienten döljer kortet helt.

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

export async function GET() {
  if (!(await inloggad())) return NextResponse.json({ ok: false }, { status: 401 })

  const status = await senasteFordonsstatus()
  // Visa kortet bara om vi har minst ett tanktal — annars döljs det helt
  if (!status || (status.fuel_pct == null && status.adblue_pct == null && status.rackvidd_m == null)) {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
  return NextResponse.json({
    ok: true,
    namn: status.namn,
    fuel_pct: status.fuel_pct,
    adblue_pct: status.adblue_pct,
    rackvidd_km: status.rackvidd_m != null ? Math.round(status.rackvidd_m / 1000) : null,
    tid: status.createdDateTime,
  }, { status: 200 })
}
