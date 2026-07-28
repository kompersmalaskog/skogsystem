import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { senasteFordonsstatus, arGammal } from '@/lib/scania'

// Lastbilens odometer vid dagens start/slut (styr flyttdagens matare_km).
// FÄRSK avläsning — bypassar 60s-cachen. Nycklarna bor i lib/scania.ts,
// server-side. Login-gatead (middleware släpper /api/* rått igenom).
// Fel/timeout → { ok:false } → klienten sparar null, blockerar aldrig.

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

  const status = await senasteFordonsstatus({ farsk: true })
  if (!status || status.odometer_m == null) {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
  return NextResponse.json({
    ok: true,
    odometer_m: status.odometer_m,
    tid: status.createdDateTime,
    stale: arGammal(status.createdDateTime, 30),
  }, { status: 200 })
}
