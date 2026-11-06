// Skotarlänken: bakgrunden "Ritad" (skogen ur laserdatan, blött, brant, terrängskuggning, vägar och diken) — samma ritning som appens Ritad.
// Hämtningen är appens egen (lib/ritadKarta/serverHamta), men OMRÅDET räknas här, av servern, ur länkens trakt: klienten skickar aldrig några
// koordinater, så länken kan inte användas för att hämta laserdata någon annanstans. Samma regel för området som appen (lib/ritadKarta/omrade):
// Vidas traktgräns → planerarens egen traktgräns → 1 km runt objektets punkt.
//
// GET /api/skotare/<token>/ritad?del=laser|mark|vagar|diken|stammar
//   stammar = { kalla, punkter: [lat, lng][] } — skördarens stammar (bara slutavverkning: i en gallring står skogen kvar), som ritar det avverkade.

import type { SupabaseClient } from '@supabase/supabase-js';
import { kontextFeature } from '@/lib/egenkontrollkarta';
import { omradeNyckel, valjOmrade, type Omrade, type Ring } from '@/lib/ritadKarta/omrade';
import { hamtaDiken, hamtaLaser, hamtaMark, hamtaVagar, type RitadSvar } from '@/lib/ritadKarta/serverHamta';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { cachadSkotarVy, lankFelSvar, objektStamIds, slaUppSkotarLank, type SkotarVy } from './server';

export const RITAD_DELAR = ['laser', 'mark', 'vagar', 'diken', 'stammar'] as const;
export type RitadDel = (typeof RITAD_DELAR)[number];
export const arRitadDel = (v: unknown): v is RitadDel => typeof v === 'string' && (RITAD_DELAR as readonly string[]).includes(v);

/** Hur länge ett lyckat svar sparas på serverinstansen. Laserdatan och vägarna ändras inte medan han skotar. */
export const RITAD_CACHE_MS = 6 * 3600_000;

/** Planerarens egna traktgränser (lineType 'boundary') i lng/lat, slutna. Kräver ett betrott origo (annars ritas inga markeringar alls). */
export function egnaTraktgranser(vy: Pick<SkotarVy, 'origo' | 'markeringar'>): Ring[] {
  if (!vy.origo) return [];
  const ut: Ring[] = [];
  for (const m of vy.markeringar) {
    if (m.lineType !== 'boundary') continue;
    const f = kontextFeature(m, vy.origo) as { geometry?: { type: string; coordinates: unknown } } | null;
    if (!f?.geometry || f.geometry.type !== 'LineString') continue;
    const pts = (f.geometry.coordinates as unknown[]).filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length < 3) continue;
    const [a, b] = [pts[0], pts[pts.length - 1]];
    ut.push(a[0] === b[0] && a[1] === b[1] ? pts : [...pts, a]);
  }
  return ut;
}

/** Området skogen ritas för — samma regel som appen. */
export function skotarRitadOmrade(vy: Pick<SkotarVy, 'gran' | 'origo' | 'markeringar' | 'mitt'>): Omrade | null {
  return valjOmrade({ vida: vy.gran as Ring[], egna: egnaTraktgranser(vy), punkt: vy.mitt });
}

const cache = new Map<string, { ts: number; v: RitadSvar }>();
export const rensaRitadCache = () => cache.clear();

/** Bara lyckade svar sparas: ett fel (Skogsstyrelsen svarade inte) prövas igen nästa gång. */
async function sparad(nyckel: string, nu: number, f: () => Promise<RitadSvar>): Promise<RitadSvar> {
  const e = cache.get(nyckel);
  if (e && nu - e.ts < RITAD_CACHE_MS) return e.v;
  const v = await f();
  if (v.status === 200) {
    cache.set(nyckel, { ts: nu, v });
    if (cache.size > 120) for (const k of Array.from(cache.keys()).slice(0, 30)) cache.delete(k);
  }
  return v;
}

const HAMTA: Record<Exclude<RitadDel, 'stammar'>, (r: Ring[]) => Promise<RitadSvar>> = {
  laser: (r) => hamtaLaser(r), mark: (r) => hamtaMark(r), vagar: (r) => hamtaVagar(r), diken: (r) => hamtaDiken(r),
};

export async function skotarRitadSvar(sb: SupabaseClient, token: string, del: unknown, nu = Date.now()): Promise<RitadSvar> {
  if (!arRitadDel(del)) return { status: 400, body: { error: 'Okänd del' } };
  const u = await slaUppSkotarLank(sb, token);
  if (!u.ok) { const f = lankFelSvar(u); return { status: f.status, body: { error: String(f.body.fel) } }; }
  const vy = await cachadSkotarVy(sb, u.objekt, nu);
  const omrade = skotarRitadOmrade(vy);
  if (!omrade) return { status: 404, body: { error: 'Trakten saknar traktgräns och position' } };
  const nyckel = `${del}|${omradeNyckel(omrade)}`;

  if (del !== 'stammar') return sparad(nyckel, nu, () => HAMTA[del](omrade.ringar));

  return sparad(`${u.objekt.id}|${nyckel}`, nu, async () => {
    if (u.objekt.typ !== 'slutavverkning') return { status: 200, body: { kalla: omrade.kalla, punkter: [] } };
    const ids = await objektStamIds(sb, u.objekt);
    if (!ids.length) return { status: 200, body: { kalla: omrade.kalla, punkter: [] } };
    const r = await hamtaAlla<{ latitude: number | null; longitude: number | null }>(
      () => sb.from('detalj_stam').select('latitude, longitude').in('objekt_id', ids).not('latitude', 'is', null) as never, 'id');
    if (r.error) return { status: 503, body: { error: 'Kunde inte läsa stammarna' } };
    const punkter = r.data.filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number').map((s) => [Math.round(s.latitude! * 1e6) / 1e6, Math.round(s.longitude! * 1e6) / 1e6]);
    return { status: 200, body: { kalla: omrade.kalla, punkter } };
  });
}
