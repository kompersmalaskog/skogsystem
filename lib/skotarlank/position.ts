// Skotarlänken: telefonen som GPS. Telefonen skickar sin position via länken, maskindatorn hämtar den via samma länk och ritar pricken.
// Servern bestämmer objektet (ur token) och tiden; bara den SENASTE positionen per trakt sparas (skotar_lank_position, ingen historik).
// En position långt från trakten sparas inte — länken är till för trakten, inte för att följa någon på väg hem.

import type { SupabaseClient } from '@supabase/supabase-js';
import { cachadSkotarVy, lankFelSvar, slaUppSkotarLank, type Svar } from './server';
import { naraTrakten } from './lassSkriv';
import { POSITION_MAX_ALDER_MS, type Position } from './positionRegler';

type Sb = SupabaseClient;
const FEL = (status: number, fel: string): Svar => ({ status, body: { ok: false, fel } });

/** Så långt (m) från trakten, stammarna eller objektets punkt sparas en position. Längre bort = "långt från trakten". */
export const POSITION_MARGINAL_M = 3000;

/** Det telefonen skickar, kontrollerat. null = går inte att läsa. */
export function lasPositionBody(body: unknown): { lat: number; lng: number; noggrannhet: number | null; kurs: number | null } | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const lat = b.lat, lng = b.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const n = typeof b.noggrannhet === 'number' && Number.isFinite(b.noggrannhet) && b.noggrannhet >= 0 ? Math.min(5000, b.noggrannhet) : null;
  const k = typeof b.kurs === 'number' && Number.isFinite(b.kurs) ? ((b.kurs % 360) + 360) % 360 : null;
  return { lat, lng, noggrannhet: n, kurs: k };
}

// ---- POST /api/skotare/<token>/position  { lat, lng, noggrannhet?, kurs? } -------------------------------------------------------------------

export async function skotarPositionSpara(sb: Sb, token: string, body: unknown, nu = Date.now()): Promise<Svar> {
  const p = lasPositionBody(body);
  if (!p) return FEL(400, 'Positionen går inte att läsa');
  const u = await slaUppSkotarLank(sb, token);
  if (!u.ok) return lankFelSvar(u);
  const vy = await cachadSkotarVy(sb, u.objekt, nu);
  const ref: [number, number][] = [...vy.gran.flat(), ...(vy.hogar?.hogar ?? []).map((h) => [h.lng, h.lat] as [number, number]), ...(vy.mitt ? [[vy.mitt.lng, vy.mitt.lat] as [number, number]] : [])];
  if (!naraTrakten([p.lng, p.lat], ref, POSITION_MARGINAL_M)) return { status: 200, body: { ok: true, langt: true } };
  const r = await sb.from('skotar_lank_position').upsert({ objekt_id: u.objekt.id, lat: p.lat, lng: p.lng, noggrannhet_m: p.noggrannhet, kurs: p.kurs }, { onConflict: 'objekt_id' });
  if (r.error) return FEL(503, 'Kunde inte skicka just nu');
  return { status: 200, body: { ok: true } };
}

// ---- GET /api/skotare/<token>/position ---------------------------------------------------------------------------------------------------

export async function skotarPositionHamta(sb: Sb, token: string, nu = Date.now()): Promise<Svar> {
  const u = await slaUppSkotarLank(sb, token);
  if (!u.ok) return lankFelSvar(u);
  const r = await sb.from('skotar_lank_position').select('lat, lng, noggrannhet_m, kurs, uppdaterad_at').eq('objekt_id', u.objekt.id).maybeSingle();
  if (r.error) return FEL(503, 'Kunde inte läsa just nu');
  const d = r.data as { lat: number; lng: number; noggrannhet_m: number | null; kurs: number | null; uppdaterad_at: string } | null;
  if (!d || nu - Date.parse(d.uppdaterad_at) > POSITION_MAX_ALDER_MS) return { status: 200, body: { ok: true, position: null } };
  const position: Position = { lat: d.lat, lng: d.lng, noggrannhet: d.noggrannhet_m, kurs: d.kurs, tid: d.uppdaterad_at };
  return { status: 200, body: { ok: true, position } };
}
