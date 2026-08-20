import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hamtaOchLagraVagdata } from '@/lib/vagdata';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Manuell hämtning av ETT objekts vägdata: planerarens omkörningsknapp (och kan anropas vid
// objektupplägg). Server-side (service-role). ALDRIG i förarens väg. Skriver objekt_vagdata +
// status; svarar med vilken instans som svarade så planeraren ser sanningen.
export async function POST(req: NextRequest) {
  const objektId = req.nextUrl.searchParams.get('objekt_id');
  if (!objektId) return NextResponse.json({ error: 'objekt_id saknas' }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const res = await hamtaOchLagraVagdata(supabase, objektId);
  return NextResponse.json(res, { status: res.status === 'ok' ? 200 : 502 });
}
