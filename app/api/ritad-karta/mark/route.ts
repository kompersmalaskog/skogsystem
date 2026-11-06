import { NextRequest, NextResponse } from 'next/server';
import { kravInloggad } from '@/lib/auth/server';
import { giltigaRingar, hamtaMark } from '@/lib/ritadKarta/serverHamta';

// Ritad — blött, brant och terrängskuggning för samma utsnitt som skogen (trakten + 300 m). Se lib/ritadKarta/mark.ts.
// In:  { ringar: [lng, lat][][] }.  Ut och regler: lib/ritadKarta/serverHamta.ts `hamtaMark`.

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const vakt = await kravInloggad();
  if (!vakt.ok) return vakt.res;
  let ringar: unknown;
  try { ringar = (await req.json())?.ringar; } catch { ringar = null; }
  if (!giltigaRingar(ringar)) return NextResponse.json({ error: 'Väntade { ringar: [lng, lat][][] }.' }, { status: 400 });
  const s = await hamtaMark(ringar);
  return NextResponse.json(s.body, { status: s.status, headers: s.headers });
}
