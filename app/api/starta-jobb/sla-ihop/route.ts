import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kravInloggad } from '@/lib/auth/server'
import { slaIhopJobb } from '@/lib/slaIhopJobb'

export const dynamic = 'force-dynamic'

// POST { franId, tillId } — slå ihop ett "Väntar på Vida"-jobb (franId) med Vidas objekt (tillId). Körs med service-roll
// (en klient får inte radera hyttspår-rader eller flytta andras rader), men flyttar INGET som inte lib/slaIhopJobb själv
// bedömt täckt av Vida-objektets traktgräns. Svaret säger exakt vad som flyttades; ett fel före sista steget lämnar P-objektet helt.
export async function POST(request: NextRequest) {
  const vakt = await kravInloggad()
  if (!vakt.ok) return vakt.res
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, fel: 'Ogiltig body' }, { status: 400 }) }
  const franId = typeof body?.franId === 'string' ? body.franId : ''
  const tillId = typeof body?.tillId === 'string' ? body.tillId : ''
  if (!franId || !tillId) return NextResponse.json({ ok: false, fel: 'franId och tillId krävs' }, { status: 400 })

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const r = await slaIhopJobb(service, { franId, tillId })
  return NextResponse.json(r, { status: r.ok ? 200 : 409 })
}
