import { NextRequest, NextResponse } from 'next/server';
import { kravInloggad } from '@/lib/auth/server';
import { giltigaRingar, hamtaLaser } from '@/lib/ritadKarta/serverHamta';

// Ritad karta: medelhöjd och skanningsdag ur Skogsstyrelsens Skogliga grunddata för trakten + 300 m runt.
// In:  { ringar: [lng, lat][][] }  (traktgränsens ringar).  Ut och regler: lib/ritadKarta/serverHamta.ts `hamtaLaser`.

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const vakt = await kravInloggad();
  if (!vakt.ok) return vakt.res;
  let ringar: unknown;
  try { ringar = (await req.json())?.ringar; } catch { ringar = null; }
  if (!giltigaRingar(ringar)) return NextResponse.json({ error: 'Väntade { ringar: [lng, lat][][] }.' }, { status: 400 });
  const s = await hamtaLaser(ringar);
  return NextResponse.json(s.body, { status: s.status, headers: s.headers });
}
