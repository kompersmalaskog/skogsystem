// Skotarlänken: det skotaren GÖR med högarna — rita runt (se vad som ligger kvar i ett område) och markera högar som tagna.
// Allt går via servern med service-klienten och länkens token. Servern bestämmer objektet (ur token), tiden (databasen) och att markeringen
// ligger på trakten (inom skördarens stammar + marginal). Klienten skickar bara typ, plats och ett id. Ingen person sparas: skapad_av = null.
//
// Markeringarna hamnar i SAMMA tabell som våra förares (skotar_hog_markering), så de syns i planeringen och i våra skotare.

import type { SupabaseClient } from '@supabase/supabase-js';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { LASS_SELECT, lassFranServer } from '@/lib/skotarLass/server';
import type { Lass } from '@/lib/skotarLass/typer';
import { lasMarkeringRad, STRECK_BREDD_M, type HogMarkering } from '@/lib/skotarHogarKvar';
import type { UttagRad } from '@/lib/skotat';
import { glomSkotarVy, lankFelSvar, objektStamIds, slaUppSkotarLank, type ObjektRad, type Svar } from './server';
import { skotarOmrade, type Stam } from './hogar';

type Sb = SupabaseClient;
const FEL = (status: number, fel: string): Svar => ({ status, body: { ok: false, fel } });

/** En markering måste ligga så här nära skördarens stammar (meter) — annars hör den inte till trakten. */
export const HOG_MARGINAL_M = 150;
/** Högst så många hörn i en ritad ring. */
export const RING_MAX_HORN = 200;
/** Högst så många markeringar per objekt och timme från länken (skydd mot en trasig klient). */
export const HOG_MAX_PER_TIMME = 300;
/** Ångra gäller bara så här länge efter markeringen (sekunder). */
export const ANGRA_S = 10 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const arPunkt = (p: unknown): p is [number, number] =>
  Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0] as number) <= 180 && Math.abs(p[1] as number) <= 90;

/** En ring [lng, lat] från klienten; null om den inte går att använda. */
export function lasRing(v: unknown): [number, number][] | null {
  if (!Array.isArray(v) || v.length < 3 || v.length > RING_MAX_HORN) return null;
  if (!v.every(arPunkt)) return null;
  return v.map((p) => [p[0], p[1]] as [number, number]);
}

/** Ligger alla punkterna inom skördarens stammar + marginal? Utan stammar finns inga högar att markera → nej. */
export function paTrakten(punkter: readonly [number, number][], stammar: readonly Stam[], marginalM = HOG_MARGINAL_M): boolean {
  if (stammar.length === 0 || punkter.length === 0) return false;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const s of stammar) { if (s.lng < minLng) minLng = s.lng; if (s.lng > maxLng) maxLng = s.lng; if (s.lat < minLat) minLat = s.lat; if (s.lat > maxLat) maxLat = s.lat; }
  const dLat = marginalM / 111_320;
  const dLng = marginalM / (111_320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));
  return punkter.every(([lng, lat]) => lng >= minLng - dLng && lng <= maxLng + dLng && lat >= minLat - dLat && lat <= maxLat + dLat);
}

type Underlag = { stammar: Stam[]; uttag: UttagRad[]; lass: Lass[]; mark: HogMarkering[] };

/** Stammarna, uttagen, lassen och markeringarna för objektet. Ett läsfel är ett fel — aldrig en uträkning på halva underlaget. */
async function lasUnderlag(sb: Sb, o: ObjektRad): Promise<Underlag | null> {
  const ids = await objektStamIds(sb, o);
  if (ids.length === 0) return { stammar: [], uttag: [], lass: [], mark: [] };
  const [stam, ts, uttag, lass, mark] = await Promise.all([
    hamtaAlla<{ latitude: number; longitude: number; total_volym: number | null; tradslag_id: string | null; sortiment: string | null }>(
      () => sb.from('detalj_stam').select('latitude, longitude, total_volym, tradslag_id, sortiment').in('objekt_id', ids).not('latitude', 'is', null) as never, 'id'),
    sb.from('dim_tradslag').select('tradslag_id, namn'),
    sb.from('skotning_uttag').select('tradslag, volym, polygon_coords').eq('objekt_id', o.id),
    hamtaAlla<unknown>(() => sb.from('skotar_lass').select(LASS_SELECT).eq('objekt_id', o.id) as never, 'id'),
    sb.from('skotar_hog_markering').select('id, typ, geometri, bredd_m, grupp, skapad_at').eq('objekt_id', o.id).order('skapad_at'),
  ]);
  if (stam.error || uttag.error || lass.error || mark.error) return null;
  const tsNamn = new Map(((ts.data ?? []) as { tradslag_id: string; namn: string }[]).map((r) => [String(r.tradslag_id), r.namn]));
  return {
    stammar: stam.data
      .filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number')
      .map((s) => ({ lat: s.latitude, lng: s.longitude, volym: Number(s.total_volym) || 0, tradslag: tsNamn.get(String(s.tradslag_id)) ?? '', sortiment: s.sortiment })),
    uttag: (uttag.data ?? []) as UttagRad[],
    lass: (lass.data as unknown[]).map(lassFranServer).filter((l): l is Lass => !!l),
    mark: ((mark.data ?? []) as Record<string, unknown>[]).map(lasMarkeringRad).filter((m): m is HogMarkering => !!m),
  };
}

// ---- POST /api/skotare/<token>/omrade  { ring: [[lng, lat], …] } ------------------------------------------------------------------------

export async function skotarOmradeSvar(sb: Sb, token: string, body: unknown): Promise<Svar> {
  const ring = lasRing((body as { ring?: unknown } | null)?.ring);
  if (!ring) return FEL(400, 'Ringen går inte att läsa');
  const u = await slaUppSkotarLank(sb, token);
  if (!u.ok) return lankFelSvar(u);
  const d = await lasUnderlag(sb, u.objekt);
  if (!d) return FEL(503, 'Kunde inte läsa just nu');
  return { status: 200, body: { ok: true, ...skotarOmrade(d.stammar, d.uttag, d.lass, d.mark, ring) } };
}

// ---- POST /api/skotare/<token>/hog  { id, typ: 'tagen'|'kvar', punkt?: [lng, lat], ring?: [[lng, lat], …], grupp?: timmer|kubb|massa|energi } -
// grupp = bara det sortimentet (som förarnas "Bara timmer"), utelämnat/null = allt.

/** Sortimentgrupperna en markering kan gälla (samma som tabellens CHECK). Övrigt går bara att ta med "Allt är taget". */
export const HOG_MARK_GRUPPER = ['timmer', 'kubb', 'massa', 'energi'] as const;

export async function skotarHogMarkera(sb: Sb, token: string, body: unknown, nu = Date.now()): Promise<Svar> {
  const b = (body ?? {}) as { id?: unknown; typ?: unknown; punkt?: unknown; ring?: unknown; grupp?: unknown };
  if (typeof b.id !== 'string' || !UUID.test(b.id)) return FEL(400, 'Ogiltigt id');
  if (b.typ !== 'tagen' && b.typ !== 'kvar') return FEL(400, 'Ogiltig typ');
  if (b.grupp != null && !(HOG_MARK_GRUPPER as readonly unknown[]).includes(b.grupp)) return FEL(400, 'Okänt sortiment');
  const grupp = (b.grupp ?? null) as (typeof HOG_MARK_GRUPPER)[number] | null;
  let geometri: { type: 'Point'; coordinates: [number, number] } | { type: 'Polygon'; coordinates: [number, number][][] };
  let punkter: [number, number][];
  if (b.ring !== undefined) {
    const ring = lasRing(b.ring);
    if (!ring || b.typ !== 'tagen') return FEL(400, 'Ringen går inte att läsa');
    geometri = { type: 'Polygon', coordinates: [[...ring, ring[0]]] };
    punkter = ring;
  } else if (arPunkt(b.punkt)) {
    geometri = { type: 'Point', coordinates: [b.punkt[0], b.punkt[1]] };
    punkter = [geometri.coordinates];
  } else return FEL(400, 'Platsen går inte att läsa');

  const u = await slaUppSkotarLank(sb, token);
  if (!u.ok) return lankFelSvar(u);
  const d = await lasUnderlag(sb, u.objekt);
  if (!d) return FEL(503, 'Kunde inte läsa just nu');
  if (!paTrakten(punkter, d.stammar)) return FEL(422, 'Markeringen ligger inte på trakten');

  const sedan = new Date(nu - 3600_000).toISOString();
  const c = await sb.from('skotar_hog_markering').select('id', { count: 'exact', head: true }).eq('objekt_id', u.objekt.id).is('skapad_av', null).gte('skapad_at', sedan);
  if (c.error) return FEL(503, 'Kunde inte spara just nu');
  if ((c.count ?? 0) >= HOG_MAX_PER_TIMME) return FEL(429, 'För många markeringar just nu — försök igen om en stund');

  const ins = await sb.from('skotar_hog_markering').insert({
    id: b.id, objekt_id: u.objekt.id, typ: b.typ, geometri, bredd_m: STRECK_BREDD_M, grupp, maskin_id: null, skapad_av: null,
  });
  // Samma id igen (ett omförsök) = redan sparad.
  if (ins.error && (ins.error as { code?: string }).code !== '23505') return FEL(503, 'Kunde inte spara just nu');
  glomSkotarVy(u.objekt.id);
  return { status: 200, body: { ok: true } };
}

// ---- DELETE /api/skotare/<token>/hog?id=<uuid> — Ångra -----------------------------------------------------------------------------------

/** Bara en markering gjord via länken (ingen person), på länkens objekt och nyss. Våra förares markeringar går aldrig att ta bort härifrån. */
export async function skotarHogAngra(sb: Sb, token: string, id: string | null, nu = Date.now()): Promise<Svar> {
  if (!id || !UUID.test(id)) return FEL(400, 'Ogiltigt id');
  const u = await slaUppSkotarLank(sb, token);
  if (!u.ok) return lankFelSvar(u);
  const sedan = new Date(nu - ANGRA_S * 1000).toISOString();
  const del = await sb.from('skotar_hog_markering').delete().eq('id', id).eq('objekt_id', u.objekt.id).is('skapad_av', null).gte('skapad_at', sedan).select('id');
  if (del.error) return FEL(503, 'Kunde inte ångra just nu');
  if (!del.data || (del.data as unknown[]).length === 0) return FEL(404, 'Gick inte att ångra');
  glomSkotarVy(u.objekt.id);
  return { status: 200, body: { ok: true } };
}
