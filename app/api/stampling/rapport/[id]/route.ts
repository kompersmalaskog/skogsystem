// En stämplingsrapport: hämta, eller spara en RÄTTAD version.
//
//   GET    → raden med den gällande läsningen och kontrollen (räknad om här, aldrig den lagrade kopian)
//   PATCH  → { lasning } användarens rättade version. Tolkas, kontrolleras om med vanlig kod och sparas i `rattad`;
//            AI:ns ursprungliga läsning (`las`) rörs aldrig. Svaret säger om det nu stämmer.
import { NextResponse } from 'next/server';
import { kravInloggad } from '@/lib/auth/server';
import { kontrollera } from '@/lib/stampling/pdf/kontroll';
import { parsaLasning } from '@/lib/stampling/pdf/rapport';
import { adminKlient, arUuid, sammanfatta, tillSvar, type RapportRad } from '@/lib/stampling/pdf/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

async function hamta(id: string) {
  const { data, error } = await adminKlient().from('stamplings_rapport').select('*').eq('id', id).maybeSingle();
  return { rad: (data as RapportRad | null) ?? null, error };
}

export async function GET(_req: Request, { params }: Ctx) {
  const v = await kravInloggad();
  if (!v.ok) return v.res;
  if (!arUuid(params.id)) return NextResponse.json({ ok: false, error: 'Ogiltigt id.' }, { status: 400 });
  const { rad, error } = await hamta(params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!rad) return NextResponse.json({ ok: false, error: 'Rapporten finns inte.' }, { status: 404 });
  return NextResponse.json({ ok: true, rapport: tillSvar(rad) });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const v = await kravInloggad();
  if (!v.ok) return v.res;
  if (!arUuid(params.id)) return NextResponse.json({ ok: false, error: 'Ogiltigt id.' }, { status: 400 });
  const body = await req.json().catch(() => null) as { lasning?: unknown } | null;
  if (!body?.lasning) return NextResponse.json({ ok: false, error: 'Rättningen saknas.' }, { status: 400 });

  let lasning;
  try { lasning = parsaLasning(body.lasning).lasning; } catch (e: any) { return NextResponse.json({ ok: false, error: e?.message ?? 'Rättningen går inte att tolka.' }, { status: 400 }); }
  const { rad, error } = await hamta(params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!rad) return NextResponse.json({ ok: false, error: 'Rapporten finns inte.' }, { status: 404 });
  if (!rad.las) return NextResponse.json({ ok: false, error: 'Rapporten är inte läst än.' }, { status: 409 });

  const kontroll = kontrollera(lasning);
  const { data, error: e2 } = await adminKlient().from('stamplings_rapport')
    .update({ rattad: lasning as unknown, ...sammanfatta(lasning, kontroll), fel: null }).eq('id', params.id).select('*').single();
  if (e2) return NextResponse.json({ ok: false, error: `Kunde inte spara rättningen: ${e2.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, rapport: tillSvar(data as RapportRad) });
}
