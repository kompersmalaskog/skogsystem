// Skotarlänken: det skotaren GÖR med högarna — rita runt (se vad som ligger kvar i ett område) och markera det han tagit + vart det gick.
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
import { cachadSkotarVy, glomSkotarVy, lankFelSvar, objektStamIds, slaUppSkotarLank, type ObjektRad, type Svar } from './server';
import { pagaendeLass, skotarOmrade, type Stam } from './hogar';

type Sb = SupabaseClient;
const FEL = (status: number, fel: string): Svar => ({ status, body: { ok: false, fel } });

/** En markering måste ligga så här nära skördarens stammar (meter) — annars hör den inte till trakten. */
export const HOG_MARGINAL_M = 150;
/** Högst så många hörn i en ritad ring. */
export const RING_MAX_HORN = 200;
/** Högst så många markeringar per objekt och timme från länken (skydd mot en trasig klient). */
export const HOG_MAX_PER_TIMME = 300;

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

// ---- POST /api/skotare/<token>/taget  { lass: uuid, avlagg: '<ref>', markeringar: [{ id, punkt? | ring?, grupp? }] } ----------------------
// ETT steg (Martin 2026-11-06: "måste veta hur mycket det ligger på varje avlägg", och inga två sätt som kan bli dubbelt):
// han markerar det han tagit (en hög, eller ett ritat område med de sortiment han bockat i) och säger vart det gick. Servern räknar vad
// markeringarna tar ur högarna (samma uträkning som kartan) och skriver markeringarna OCH ett lass med den volymen på avlägget. Det finns
// inget annat sätt att rapportera ett lass. Lasset bär markeringarnas id:n, så Ångra och Ta bort tar bort båda.

/** Sortimentgrupperna en markering kan gälla (samma som tabellens CHECK). Övrigt går bara att ta med "Allt är taget". */
export const HOG_MARK_GRUPPER = ['timmer', 'kubb', 'massa', 'energi'] as const;
/** Ett område kan vara flera lass: taket är bara ett skydd mot en trasig uträkning. */
export const TAGET_MAX_M3 = 1000;

type NyMark = { id: string; geometri: { type: 'Point'; coordinates: [number, number] } | { type: 'Polygon'; coordinates: [number, number][][] }; punkter: [number, number][]; grupp: string | null };

function lasMarkeringar(v: unknown): NyMark[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > HOG_MARK_GRUPPER.length) return null;
  const ut: NyMark[] = [];
  const grupper = new Set<string | null>();
  for (const x of v) {
    const b = (x ?? {}) as { id?: unknown; punkt?: unknown; ring?: unknown; grupp?: unknown };
    if (typeof b.id !== 'string' || !UUID.test(b.id)) return null;
    if (b.grupp != null && !(HOG_MARK_GRUPPER as readonly unknown[]).includes(b.grupp)) return null;
    const grupp = (b.grupp ?? null) as string | null;
    if (grupper.has(grupp)) return null;
    grupper.add(grupp);
    if (b.ring !== undefined) {
      const ring = lasRing(b.ring);
      if (!ring) return null;
      ut.push({ id: b.id, geometri: { type: 'Polygon', coordinates: [[...ring, ring[0]]] }, punkter: ring, grupp });
    } else if (arPunkt(b.punkt)) {
      ut.push({ id: b.id, geometri: { type: 'Point', coordinates: [b.punkt[0], b.punkt[1]] }, punkter: [[b.punkt[0], b.punkt[1]]], grupp });
    } else return null;
  }
  // "Allt" och ett enskilt sortiment i samma markering vore dubbelt.
  if (grupper.has(null) && grupper.size > 1) return null;
  return ut;
}

export async function skotarTaget(sb: Sb, token: string, body: unknown, nu = Date.now()): Promise<Svar> {
  const b = (body ?? {}) as { lass?: unknown; avlagg?: unknown; markeringar?: unknown };
  if (typeof b.lass !== 'string' || !UUID.test(b.lass)) return FEL(400, 'Ogiltigt id');
  if (typeof b.avlagg !== 'string' || b.avlagg.length > 90) return FEL(400, 'Välj ett avlägg');
  const nya = lasMarkeringar(b.markeringar);
  if (!nya) return FEL(400, 'Markeringen går inte att läsa');

  const u = await slaUppSkotarLank(sb, token);
  if (!u.ok) return lankFelSvar(u);
  // Samma lass-id igen (ett omförsök efter tappad täckning) = redan sparat, svara med det som sparades.
  const fanns = await sb.from('skotar_lank_lass').select('id, sortiment').eq('id', b.lass).eq('objekt_id', u.objekt.id);
  if (fanns.error) return FEL(503, 'Kunde inte spara just nu');
  const forra = ((fanns.data ?? []) as { sortiment?: Record<string, number> }[])[0];
  if (forra) {
    const s0 = forra.sortiment ?? {};
    return { status: 200, body: { ok: true, m3: Math.round(Object.values(s0).reduce((a, x) => a + Number(x || 0), 0) * 10) / 10, sortiment: s0 } };
  }
  const d = await lasUnderlag(sb, u.objekt);
  if (!d) return FEL(503, 'Kunde inte läsa just nu');
  if (!nya.every((m) => paTrakten(m.punkter, d.stammar))) return FEL(422, 'Markeringen ligger inte på trakten');
  glomSkotarVy(u.objekt.id);   // färsk läsning: avlägget kan just ha skapats på en annan serverinstans
  const vy = await cachadSkotarVy(sb, u.objekt, nu);
  if (!vy.avlagg) return FEL(503, 'Kunde inte läsa just nu');
  if (!vy.avlagg.some((a) => a.ref === b.avlagg)) return FEL(422, 'Avlägget finns inte på trakten');

  const tid = new Date(nu).toISOString();
  const hogMark = nya.map((m) => lasMarkeringRad({ id: m.id, typ: 'tagen', geometri: m.geometri, bredd_m: STRECK_BREDD_M, grupp: m.grupp, skapad_at: tid })).filter((m): m is HogMarkering => !!m);
  if (hogMark.length !== nya.length) return FEL(400, 'Markeringen går inte att läsa');
  const sortiment = pagaendeLass(d.stammar, d.uttag, d.lass, [...d.mark, ...hogMark], hogMark);
  const m3 = Object.values(sortiment).reduce((a, x) => a + x, 0);
  if (m3 <= 0) return FEL(422, 'Det ligger inget kvar att ta här');
  if (m3 > TAGET_MAX_M3) return FEL(422, 'För stort område — rita runt en mindre del');

  const sedan = new Date(nu - 3600_000).toISOString();
  const c = await sb.from('skotar_hog_markering').select('id', { count: 'exact', head: true }).eq('objekt_id', u.objekt.id).is('skapad_av', null).gte('skapad_at', sedan);
  if (c.error) return FEL(503, 'Kunde inte spara just nu');
  if ((c.count ?? 0) + nya.length > HOG_MAX_PER_TIMME) return FEL(429, 'För många markeringar just nu — försök igen om en stund');

  const ins = await sb.from('skotar_hog_markering').insert(nya.map((m) => ({
    id: m.id, objekt_id: u.objekt.id, typ: 'tagen', geometri: m.geometri, bredd_m: STRECK_BREDD_M, grupp: m.grupp, maskin_id: null, skapad_av: null,
  })));
  if (ins.error && (ins.error as { code?: string }).code !== '23505') return FEL(503, 'Kunde inte spara just nu');
  const lass = await sb.from('skotar_lank_lass').insert({ id: b.lass, objekt_id: u.objekt.id, avlagg: b.avlagg, sortiment, markeringar: nya.map((m) => m.id) });
  if (lass.error && (lass.error as { code?: string }).code !== '23505') {
    // Allt eller inget: utan lass får markeringarna inte ligga kvar (då vore volymen borta från kartan men inte på avlägget).
    await sb.from('skotar_hog_markering').delete().in('id', nya.map((m) => m.id)).eq('objekt_id', u.objekt.id).is('skapad_av', null);
    glomSkotarVy(u.objekt.id);
    return FEL(503, 'Kunde inte spara just nu');
  }
  glomSkotarVy(u.objekt.id);
  return { status: 200, body: { ok: true, m3: Math.round(m3 * 10) / 10, sortiment } };
}
