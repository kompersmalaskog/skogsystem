// Skotarlänken: avläggen han sätter ut och lassen han rapporterar. Allt via servern med länkens token: objektet ur token, tiden från databasen,
// avlägget måste ligga nära trakten, ett lass måste gälla ett avlägg på trakten och sortimenten på trakten. EGNA tabeller (skotar_lank_avlagg,
// skotar_lank_lass) — räknas aldrig som vår skotning.

import type { SupabaseClient } from '@supabase/supabase-js';
import { cachadSkotarVy, glomSkotarVy, lankFelSvar, slaUppSkotarLank, type Svar } from './server';
import { LASS_MAX_M3, nastaNummer, rensaSortiment, type EgetAvlaggRad } from './avlagg';

type Sb = SupabaseClient;
const FEL = (status: number, fel: string): Svar => ({ status, body: { ok: false, fel } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const arPunkt = (p: unknown): p is [number, number] =>
  Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0] as number) <= 180 && Math.abs(p[1] as number) <= 90;

/** Ett avlägg får ligga så här långt (m) från traktgränsen, stammarna eller objektets punkt — avlägget ligger ofta vid vägen utanför trakten. */
export const AVLAGG_MARGINAL_M = 1500;
/** Högst så många lass per objekt och timme från länken. */
export const LASS_MAX_PER_TIMME = 60;
export const AVLAGG_MAX_PER_TIMME = 20;

/** Ligger punkten inom marginalen från något av referenspunkterna (ruta runt dem)? */
export function naraTrakten(p: [number, number], ref: readonly [number, number][], marginalM = AVLAGG_MARGINAL_M): boolean {
  if (ref.length === 0) return false;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [x, y] of ref) { if (x < minLng) minLng = x; if (x > maxLng) maxLng = x; if (y < minLat) minLat = y; if (y > maxLat) maxLat = y; }
  const dLat = marginalM / 111_320;
  const dLng = marginalM / (111_320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));
  return p[0] >= minLng - dLng && p[0] <= maxLng + dLng && p[1] >= minLat - dLat && p[1] <= maxLat + dLat;
}

async function inomTimme(sb: Sb, tabell: string, objektId: string, nu: number): Promise<number | null> {
  const c = await sb.from(tabell).select('id', { count: 'exact', head: true }).eq('objekt_id', objektId).gte('skapad_at', new Date(nu - 3600_000).toISOString());
  return c.error ? null : c.count ?? 0;
}

// ---- POST /api/skotare/<token>/avlagg  { id, punkt: [lng, lat] } -----------------------------------------------------------------------------

export async function skotarAvlaggNytt(sb: Sb, token: string, body: unknown, nu = Date.now()): Promise<Svar> {
  const b = (body ?? {}) as { id?: unknown; punkt?: unknown };
  if (typeof b.id !== 'string' || !UUID.test(b.id)) return FEL(400, 'Ogiltigt id');
  if (!arPunkt(b.punkt)) return FEL(400, 'Platsen går inte att läsa');
  const punkt: [number, number] = [b.punkt[0], b.punkt[1]];
  const u = await slaUppSkotarLank(sb, token);
  if (!u.ok) return lankFelSvar(u);
  glomSkotarVy(u.objekt.id);   // färsk läsning: en annan serverinstans kan just ha skrivit
  const vy = await cachadSkotarVy(sb, u.objekt, nu);
  const ref: [number, number][] = [...vy.gran.flat(), ...(vy.hogar?.hogar ?? []).map((h) => [h.lng, h.lat] as [number, number]), ...(vy.mitt ? [[vy.mitt.lng, vy.mitt.lat] as [number, number]] : [])];
  if (!naraTrakten(punkt, ref)) return FEL(422, 'Avlägget ligger för långt från trakten');
  const egna = await sb.from('skotar_lank_avlagg').select('id, nummer, lat, lng, borttagen').eq('objekt_id', u.objekt.id);
  if (egna.error || !vy.avlagg) return FEL(503, 'Kunde inte spara just nu');
  const antal = await inomTimme(sb, 'skotar_lank_avlagg', u.objekt.id, nu);
  if (antal == null) return FEL(503, 'Kunde inte spara just nu');
  if (antal >= AVLAGG_MAX_PER_TIMME) return FEL(429, 'För många nya avlägg just nu — försök igen om en stund');
  const nummer = nastaNummer(vy.avlagg, (egna.data ?? []) as EgetAvlaggRad[]);
  const ins = await sb.from('skotar_lank_avlagg').insert({ id: b.id, objekt_id: u.objekt.id, nummer, lng: punkt[0], lat: punkt[1] });
  if (ins.error && (ins.error as { code?: string }).code !== '23505') return FEL(503, 'Kunde inte spara just nu');
  glomSkotarVy(u.objekt.id);
  return { status: 200, body: { ok: true, ref: `egen:${b.id}`, nr: String(nummer) } };
}

// ---- DELETE /api/skotare/<token>/avlagg?id= — bara hans eget, och bara när inga lass gäller det -------------------------------------------

export async function skotarAvlaggTaBort(sb: Sb, token: string, id: string | null, nu = Date.now()): Promise<Svar> {
  if (!id || !UUID.test(id)) return FEL(400, 'Ogiltigt id');
  const u = await slaUppSkotarLank(sb, token);
  if (!u.ok) return lankFelSvar(u);
  glomSkotarVy(u.objekt.id);   // färsk läsning: en annan serverinstans kan just ha skrivit
  const vy = await cachadSkotarVy(sb, u.objekt, nu);
  const a = vy.avlagg?.find((x) => x.ref === `egen:${id}`);
  if (!a) return FEL(404, 'Avlägget finns inte');
  if (a.lass > 0) return FEL(409, 'Avlägget har lass — ta bort dem först');
  const r = await sb.from('skotar_lank_avlagg').update({ borttagen: true }).eq('id', id).eq('objekt_id', u.objekt.id).select('id');
  if (r.error || !(r.data as unknown[] | null)?.length) return FEL(503, 'Kunde inte ta bort just nu');
  glomSkotarVy(u.objekt.id);
  return { status: 200, body: { ok: true } };
}

// ---- POST /api/skotare/<token>/lass  { id, avlagg: '<ref>', sortiment: { '<namn>': m3 } } -------------------------------------------------

export async function skotarLassNytt(sb: Sb, token: string, body: unknown, nu = Date.now()): Promise<Svar> {
  const b = (body ?? {}) as { id?: unknown; avlagg?: unknown; sortiment?: unknown };
  if (typeof b.id !== 'string' || !UUID.test(b.id)) return FEL(400, 'Ogiltigt id');
  if (typeof b.avlagg !== 'string' || b.avlagg.length > 90) return FEL(400, 'Avlägget går inte att läsa');
  const sortiment = rensaSortiment(b.sortiment);
  const summa = Object.values(sortiment).reduce((a, x) => a + x, 0);
  if (Object.keys(sortiment).length === 0) return FEL(400, 'Lasset är tomt');
  if (summa > LASS_MAX_M3) return FEL(400, `Ett lass kan vara högst ${LASS_MAX_M3} m³`);
  const u = await slaUppSkotarLank(sb, token);
  if (!u.ok) return lankFelSvar(u);
  glomSkotarVy(u.objekt.id);   // färsk läsning: en annan serverinstans kan just ha skrivit
  const vy = await cachadSkotarVy(sb, u.objekt, nu);
  if (!vy.avlagg) return FEL(503, 'Kunde inte spara just nu');
  if (!vy.avlagg.some((a) => a.ref === b.avlagg)) return FEL(422, 'Avlägget finns inte på trakten');
  const tillatna = new Set(vy.sortiment.map((x) => x.namn));
  if (Object.keys(sortiment).some((k) => !tillatna.has(k))) return FEL(422, 'Sortimentet finns inte på trakten');
  const antal = await inomTimme(sb, 'skotar_lank_lass', u.objekt.id, nu);
  if (antal == null) return FEL(503, 'Kunde inte spara just nu');
  if (antal >= LASS_MAX_PER_TIMME) return FEL(429, 'För många lass just nu — försök igen om en stund');
  const ins = await sb.from('skotar_lank_lass').insert({ id: b.id, objekt_id: u.objekt.id, avlagg: b.avlagg, sortiment });
  if (ins.error && (ins.error as { code?: string }).code !== '23505') return FEL(503, 'Kunde inte spara just nu');
  glomSkotarVy(u.objekt.id);
  return { status: 200, body: { ok: true } };
}

// ---- DELETE /api/skotare/<token>/lass?id= — strykes (raden finns kvar) ---------------------------------------------------------------------

export async function skotarLassTaBort(sb: Sb, token: string, id: string | null): Promise<Svar> {
  if (!id || !UUID.test(id)) return FEL(400, 'Ogiltigt id');
  const u = await slaUppSkotarLank(sb, token);
  if (!u.ok) return lankFelSvar(u);
  const r = await sb.from('skotar_lank_lass').update({ struken: true }).eq('id', id).eq('objekt_id', u.objekt.id).select('id');
  if (r.error) return FEL(503, 'Kunde inte ta bort just nu');
  if (!(r.data as unknown[] | null)?.length) return FEL(404, 'Lasset finns inte');
  glomSkotarVy(u.objekt.id);
  return { status: 200, body: { ok: true } };
}
