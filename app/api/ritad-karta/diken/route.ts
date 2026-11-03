import { NextRequest, NextResponse } from 'next/server';
import { kravInloggad } from '@/lib/auth/server';
import { adminSupabase } from '@/lib/auth/admin';
import { DIKE_MARGINAL_M, DIKE_MAX, raderTillDiken, rutaArgument } from '@/lib/ritadKarta/diken';
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
  // Rutans index (dike_i_ruta, migration 20261103150307): ett filter på fyra kolumner läste hela tabellen (9,5 s). Sidor på id (efter).
  const rader: { id: number; typ: unknown; coords: unknown }[] = [];
  let efter = 0;
  while (rader.length < DIKE_MAX) {
    const { data, error } = await sb.rpc('dike_i_ruta', { ...rutaArgument(box), p_efter: efter, p_antal: SIDA });
    if (error) return fel(502, 'Kunde inte läsa dikena');
    const sida = (data ?? []) as { id: number; typ: unknown; coords: unknown }[];
    rader.push(...sida);
    if (sida.length < SIDA) break;
    efter = sida[sida.length - 1].id;
  }
  return NextResponse.json(raderTillDiken(rader), { headers: { 'Cache-Control': 'private, max-age=3600' } });
}
