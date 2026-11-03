import { NextRequest, NextResponse } from 'next/server';
import { kravInloggad } from '@/lib/auth/server';
import { adminSupabase } from '@/lib/auth/admin';
import { DIKE_MARGINAL_M, DIKE_MAX, dikeFilter, raderTillDiken } from '@/lib/ritadKarta/diken';
import { vagBox } from '@/lib/ritadKarta/vagar';

// Ritad — dikena runt trakten ur tabellen `dike` (Naturvårdsverkets dikeskarta, se lib/ritadKarta/diken.ts).
// In:  { ringar: [lng, lat][][] }
// Ut:  GeoJSON FeatureCollection, varje dike med { s: sort }. Vägdiken är bortplockade. Fel: { error }.

const SIDA = 1000;
const fel = (status: number, text: string) => NextResponse.json({ error: text }, { status });

export async function POST(req: NextRequest) {
  const vakt = await kravInloggad();
  if (!vakt.ok) return vakt.res;

  let ringar: [number, number][][];
  try {
    ringar = (await req.json())?.ringar;
    if (!Array.isArray(ringar) || ringar.length === 0 || ringar.length > 200) throw new Error();
  } catch {
    return fel(400, 'Fel indata');
  }
  const box = vagBox(ringar, DIKE_MARGINAL_M);
  if (!box) return fel(400, 'Fel indata');

  const sb = adminSupabase();
  const rader: { typ: unknown; coords: unknown }[] = [];
  for (let fran = 0; fran < DIKE_MAX; fran += SIDA) {
    let q: any = sb.from('dike').select('id, typ, coords');
    for (const f of dikeFilter(box)) q = q[f.op](f.kol, f.v);
    const { data, error } = await q.order('id').range(fran, fran + SIDA - 1);
    if (error) return fel(502, 'Kunde inte läsa dikena');
    rader.push(...(data ?? []));
    if (!data || data.length < SIDA) break;
  }
  return NextResponse.json(raderTillDiken(rader), { headers: { 'Cache-Control': 'private, max-age=3600' } });
}
