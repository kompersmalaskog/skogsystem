import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kravInloggad } from '@/lib/auth/server'
import { kopplaHyttsparTillObjekt } from '@/lib/hyttsparKoppling'

export const dynamic = 'force-dynamic'

// POST { objektId, maskinId } — koppla maskinens hyttspår UTAN objekt (skyddsnätet: ingen svarade på "Inget objekt här") till ett objekt som
// täcker spåret (traktgräns → inne, bara en punkt → inom 300 m). Service-roll: en klient får inte slå ihop/radera spår-rader.
// Idempotent. Flyttar bara maskinens egna rader från de senaste dagarna.
export async function POST(request: NextRequest) {
  const vakt = await kravInloggad()
  if (!vakt.ok) return vakt.res
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, fel: 'Ogiltig body' }, { status: 400 }) }
  const objektId = typeof body?.objektId === 'string' ? body.objektId : ''
  const maskinId = typeof body?.maskinId === 'string' ? body.maskinId.trim() : ''
  if (!objektId || !maskinId) return NextResponse.json({ ok: false, fel: 'objektId och maskinId krävs' }, { status: 400 })

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data: o, error } = await service.from('objekt').select('id, lat, lng').eq('id', objektId).maybeSingle()
  if (error) return NextResponse.json({ ok: false, fel: 'Kunde inte läsa objektet: ' + error.message }, { status: 500 })
  if (!o) return NextResponse.json({ ok: false, fel: 'Objektet finns inte' }, { status: 404 })
  const { data: g, error: gFel } = await service.from('objekt_geometri').select('geometri').eq('objekt_id', objektId).maybeSingle()
  if (gFel) return NextResponse.json({ ok: false, fel: 'Kunde inte läsa traktgränsen: ' + gFel.message }, { status: 500 })

  // Maskinens eget, nyss loggade spår: ett par punkter räcker (minst 1 inne, hälften av spåret) och bara de senaste dagarna.
  const r = await kopplaHyttsparTillObjekt(service, { id: o.id, lat: o.lat, lng: o.lng, geometri: g?.geometri ?? null }, { maskinId, dagar: 3, punkterMin: 1 })
  return NextResponse.json(r, { status: r.ok ? 200 : 500 })
}
