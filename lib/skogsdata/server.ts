// SKOGSDATA — körningen (cron /api/cron/skogsdata, varje timme). Samma mönster som traktanalysen (lib/traktAnalys/server.ts):
// alla virkestrakter med Vidas traktgräns får sin laserdata, lutning och fukt hämtad EN gång och sparad i `objekt_skogsdata`.
//
// Ordning: trakter som inte är avslutade först (det är dem prognosen gäller), sedan avslutade gallringar och slutavverkningar, nyast först —
// de behövs som facit: bara på en färdig trakt går det att se vad lasern sa mot vad skördaren faktiskt tog ut.
// En trakt görs om när gränsen ändrats, när lutning/fukt föll (tidigast efter 6 h) eller aldrig hämtats. Laserdatan själv åldras inte.

import type { SupabaseClient } from '@supabase/supabase-js';
import { traktgransRingar } from '@/lib/objektPlats';
import { gransAvtryck } from '@/lib/traktAnalys/server';
import { hamtaUtsnitt, type HamtaSvar } from './hamta';
import { planeraUtsnitt, sammanfatta, tillSparat, type Plan, type Ring, type Rutnat } from './rutnat';

export const VERSION = 1;
export const FEL_OMFORSOK_MS = 6 * 3600_000;
const SAMTIDIGA = 4;
const AKTIVA = ['oplanerad', 'planerad', 'pagaende', 'skotning'];
const VIRKE = ['gallring', 'slutavverkning'];

type Sparad = { objekt_id: string; grans: string; version: number; hamtad_at: string; fel: string[] | null };

/** Lägre = viktigare, null = aktuell. */
export function behov(s: Sparad | undefined, grans: string, nu: number): number | null {
  if (!s) return 0;
  if (s.grans !== grans || s.version !== VERSION) return 1;
  if ((s.fel?.length ?? 0) > 0 && nu - Date.parse(s.hamtad_at) >= FEL_OMFORSOK_MS) return 2;
  return null;
}

export type KorSvar = { ok: boolean; hamtade: string[]; aktuella: number; kvar: number; utanGrans: number; fel: string[] };

export async function korSkogsdata(
  sb: SupabaseClient,
  opt: { budgetMs: number; nu?: () => number; hamta?: (p: Plan) => Promise<HamtaSvar> },
): Promise<KorSvar> {
  const nu = opt.nu ?? Date.now;
  const hamta = opt.hamta ?? hamtaUtsnitt;
  const start = nu();
  const svar: KorSvar = { ok: true, hamtade: [], aktuella: 0, kvar: 0, utanGrans: 0, fel: [] };

  const o = await sb.from('objekt').select('id, namn, status, typ, avslutad_timestamp').in('typ', VIRKE);
  if (o.error) return { ...svar, ok: false, fel: [`objekt: ${o.error.message}`] };
  const objekt = (o.data ?? []) as { id: string; namn: string | null; status: string | null; typ: string; avslutad_timestamp: string | null }[];
  if (!objekt.length) return svar;

  const g = await sb.from('objekt_traktgrans').select('objekt_id, geometri');
  if (g.error) return { ...svar, ok: false, fel: [`objekt_traktgrans: ${g.error.message}`] };
  const ringarPer = new Map<string, Ring[]>();
  for (const rad of (g.data ?? []) as { objekt_id: string; geometri: unknown }[]) {
    const r = traktgransRingar(rad.geometri as never);
    if (r.length) ringarPer.set(rad.objekt_id, [...(ringarPer.get(rad.objekt_id) ?? []), ...r]);
  }

  const s = await sb.from('objekt_skogsdata').select('objekt_id, grans, version, hamtad_at, fel');
  if (s.error) return { ...svar, ok: false, fel: [`objekt_skogsdata: ${s.error.message}`] };
  const sparade = new Map(((s.data ?? []) as Sparad[]).map((x) => [x.objekt_id, x]));

  const ko: { id: string; namn: string; ringar: Ring[]; grans: string; vikt: number; aktiv: boolean; avslutad: string }[] = [];
  for (const x of objekt) {
    const ringar = ringarPer.get(x.id);
    if (!ringar?.length) { svar.utanGrans++; continue; }
    const grans = gransAvtryck(ringar);
    const v = behov(sparade.get(x.id), grans, start);
    if (v === null) { svar.aktuella++; continue; }
    ko.push({ id: x.id, namn: x.namn ?? x.id, ringar, grans, vikt: v, aktiv: AKTIVA.includes(x.status ?? ''), avslutad: x.avslutad_timestamp ?? '' });
  }
  // Aktiva först, sedan efter behov, sedan senast avslutade först.
  ko.sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.vikt - b.vikt || b.avslutad.localeCompare(a.avslutad));

  for (let i = 0; i < ko.length; i++) {
    if (nu() - start > opt.budgetMs) { svar.kvar = ko.length - i; break; }
    const t = ko[i];
    try {
      const plan = planeraUtsnitt(t.ringar);
      if (!plan) { svar.fel.push(`${t.namn}: trakten är för stor`); continue; }
      const nat: Rutnat[] = [], fel: string[] = [];
      // En utspridd trakt (Santhe: elva bitar) är flera utsnitt — fyra åt gången, så funktionen hinner inom sin tid.
      for (let k = 0; k < plan.length; k += SAMTIDIGA) {
        const svarK = await Promise.all(plan.slice(k, k + SAMTIDIGA).map((p) => hamta(p)));
        for (const r of svarK) { nat.push(r.nat); for (const f of r.fel) if (!fel.includes(f)) fel.push(f); }
      }
      const u = await sb.from('objekt_skogsdata').upsert({
        objekt_id: t.id, grans: t.grans, version: VERSION, hamtad_at: new Date(nu()).toISOString(),
        sammanfattning: sammanfatta(nat), rutnat: nat.map(tillSparat), fel,
      }, { onConflict: 'objekt_id' });
      if (u.error) { svar.fel.push(`${t.namn}: ${u.error.message}`); continue; }
      svar.hamtade.push(t.namn);
    } catch (e) {
      svar.fel.push(`${t.namn}: ${(e as Error)?.message ?? 'okänt fel'}`);
    }
  }
  svar.ok = svar.fel.length === 0;
  return svar;
}
