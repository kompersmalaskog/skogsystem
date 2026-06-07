import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Service-nyckel server-side: bolag-tabellen är RLS-blockerad för anon-nyckeln.
// Snävt skopat: lista/sök namn (GET) + skapa namn (POST). Flaggat för launch-härdning.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') || '').trim()
  let query = admin.from('bolag').select('id, namn').order('namn', { ascending: true })
  if (q) query = query.ilike('namn', `%${q}%`)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bolag: data ?? [] })
}

export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ogiltig body' }, { status: 400 })
  }
  const namn = (body?.namn ?? '').trim()
  if (!namn) return NextResponse.json({ error: 'Namn saknas' }, { status: 400 })

  // Finns redan (case-insensitivt, exakt)?
  const { data: existing } = await admin
    .from('bolag').select('id, namn').ilike('namn', namn).limit(1).maybeSingle()
  if (existing) return NextResponse.json({ bolag: existing })

  const { data: created, error } = await admin
    .from('bolag').insert({ namn }).select('id, namn').single()
  if (error) {
    // Race mot unik-index → hämta befintlig istället.
    if ((error as { code?: string }).code === '23505') {
      const { data: again } = await admin
        .from('bolag').select('id, namn').ilike('namn', namn).limit(1).maybeSingle()
      if (again) return NextResponse.json({ bolag: again })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ bolag: created })
}
