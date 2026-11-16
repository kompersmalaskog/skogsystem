import { NextRequest, NextResponse } from 'next/server';
import { kravInloggad } from '@/lib/auth/server';
import { hamtaVagar } from '@/lib/ritadKarta/serverHamta';

// Ritad — vägarna runt trakten ur Trafikverkets NVDB. Se lib/ritadKarta/vagar.ts.
// In:  { ringar: [lng, lat][][] }.  Ut och regler: lib/ritadKarta/serverHamta.ts `hamtaVagar`.

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const vakt = await kravInloggad();
  if (!vakt.ok) return vakt.res;
  let ringar: unknown;
  try { ringar = (await req.json())?.ringar; } catch { ringar = null; }
  if (!Array.isArray(ringar) || ringar.length === 0 || ringar.length > 200) return NextResponse.json({ error: 'Fel indata' }, { status: 400 });
  const s = await hamtaVagar(ringar);
  return NextResponse.json(s.body, { status: s.status, headers: s.headers });
}
