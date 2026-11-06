import { NextRequest, NextResponse } from 'next/server';
import { kravInloggad } from '@/lib/auth/server';
import { hamtaDiken } from '@/lib/ritadKarta/serverHamta';

// Ritad — dikena runt trakten ur tabellen `dike` (Naturvårdsverkets dikeskarta, se lib/ritadKarta/diken.ts).
// In:  { ringar: [lng, lat][][] }.  Ut och regler: lib/ritadKarta/serverHamta.ts `hamtaDiken`.

export async function POST(req: NextRequest) {
  const vakt = await kravInloggad();
  if (!vakt.ok) return vakt.res;
  let ringar: unknown;
  try { ringar = (await req.json())?.ringar; } catch { ringar = null; }
  if (!Array.isArray(ringar) || ringar.length === 0 || ringar.length > 200) return NextResponse.json({ error: 'Fel indata' }, { status: 400 });
  const s = await hamtaDiken(ringar);
  return NextResponse.json(s.body, { status: s.status, headers: s.headers });
}
