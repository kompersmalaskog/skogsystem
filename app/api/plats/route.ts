import { NextRequest, NextResponse } from 'next/server'
import { kravInloggad } from '@/lib/auth/server'
import { sokPlats, narmasteOrtnamn } from '@/lib/platsSok'

export const dynamic = 'force-dynamic'

// Plats-API för Starta jobb. Nyckeln (ORS_API_KEY) stannar här — klienten ser den aldrig.
//   GET /api/plats?q=<text>            → { traffar: [{ etikett, namn, lat, lng, lager }] }   ("Sök fastighet": ort/by/gård/adress)
//   GET /api/plats?lat=..&lng=..       → { ort: { namn, avstandM, lager } | null }            (närmaste ortnamn = förslag på jobbets namn)
export async function GET(request: NextRequest) {
  const vakt = await kravInloggad()
  if (!vakt.ok) return vakt.res
  const p = request.nextUrl.searchParams
  const q = (p.get('q') || '').trim()
  if (q) {
    if (q.length < 2) return NextResponse.json({ ok: false, fel: 'Skriv minst två tecken' }, { status: 400 })
    const r = await sokPlats(q.slice(0, 120))
    if (!r.ok) return NextResponse.json({ ok: false, fel: r.fel }, { status: 502 })
    return NextResponse.json({ ok: true, traffar: r.traffar })
  }
  const lat = Number(p.get('lat')), lng = Number(p.get('lng'))
  if (p.get('lat') != null && Number.isFinite(lat) && Number.isFinite(lng) && lat >= 54 && lat <= 70 && lng >= 9 && lng <= 25) {
    const r = await narmasteOrtnamn(lat, lng)
    if (!r.ok) return NextResponse.json({ ok: false, fel: r.fel }, { status: 502 })
    return NextResponse.json({ ok: true, ort: r.ort })
  }
  return NextResponse.json({ ok: false, fel: 'Ange q=<text> eller lat och lng' }, { status: 400 })
}
