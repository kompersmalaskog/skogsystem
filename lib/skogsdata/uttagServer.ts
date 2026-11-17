// UTTAGET PER TRAKT — körningen (samma timjobb som laserdatan, /api/cron/skogsdata, efter hämtningen).
//
// För varje virkestrakt med laserdata läses skördarens stammar (detalj_stam under ALLA traktens nummer, RPC skogsdata_stammar) och uttaget
// mäts (lib/skogsdata/uttag). Resultatet sparas i objekt_skogsdata.uttag och läses av prognosen (helikoptern).
//   · Aktiva trakter räknas om när antalet stammar ändrats (eller skördningen blivit klar).
//   · Avslutade trakter räknas EN gång, med provet "vad hade metoden sagt vid 25 % och 50 %?" — facit för hur bra metoden är.
// Efteråt fryses appens prognos (lib/prognos/appPrognos) för aktiva trakter som saknar en: importen väntar på laserdatan, och den finns nu.

import type { SupabaseClient } from '@supabase/supabase-js';
import { tillSweref } from '@/lib/laserGrundytaRutnat';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { objektIds, type AltRad, type DimRad } from '@/lib/objektoversikt/berakna';
import { frysAppPrognos, hamtaUtfall } from '@/lib/prognos/appPrognos';
import { franSparat, type SparatRutnat } from './rutnat';
import { matUttag, provaUttag, type SparatUttag, type Stam } from './uttag';

const AKTIVA = ['oplanerad', 'planerad', 'pagaende', 'skotning'];
const VIRKE = ['gallring', 'slutavverkning'];
/** Fasen säger att skördaren är klar på trakten (objekt.fas, timjobbet objekt_status_ur_maskindata). */
const SKORDAT_KLART = ['skotas', 'vantar_skotare'];

export type UttagSvar = { raknade: string[]; kvar: number; frysta: string[]; fel: string[] };

type StamSvar = { stammar: [number, number, number, number | null][]; utan: { antal: number; vol: number } };

/** Ren: det som sparas för en trakt, ur rutnätet och stammarna. */
export function raknaUttag(nat: SparatRutnat[], svar: StamSvar, klar: boolean, avslutad: boolean, nu: Date): SparatUttag {
  const xy = tillSweref(svar.stammar.map((s) => [s[1], s[0]] as [number, number]));
  const stammar: Stam[] = svar.stammar.map((s, i) => ({ x: xy[i][0], y: xy[i][1], vol: Number(s[2]) || 0, t: s[3] == null ? null : Number(s[3]) }));
  const rutnat = nat.map(franSparat);
  const skordat = Math.round((stammar.reduce((a, s) => a + s.vol, 0) + svar.utan.vol) * 10) / 10;
  const ut: SparatUttag = { antal: stammar.length + svar.utan.antal, raknad: nu.toISOString(), skordat, klar, matt: matUttag(rutnat, stammar, svar.utan) };
  if (avslutad) ut.prov = provaUttag(rutnat, stammar);
  return ut;
}

export async function korUttag(sb: SupabaseClient, opt: { budgetMs: number; nu?: () => number }): Promise<UttagSvar> {
  const nu = opt.nu ?? Date.now;
  const start = nu();
  const svar: UttagSvar = { raknade: [], kvar: 0, frysta: [], fel: [] };

  const [o, s, dim, alt, grans] = await Promise.all([
    sb.from('objekt').select('id, namn, status, fas, typ, vo_nummer, dim_objekt_id, app_prognos, avslutad_timestamp').in('typ', VIRKE),
    sb.from('objekt_skogsdata').select('objekt_id, uttag'),
    hamtaAlla<DimRad>(() => sb.from('dim_objekt').select('objekt_id, vo_nummer'), 'objekt_id'),
    hamtaAlla<AltRad>(() => sb.from('objekt_alt_nummer').select('id, objekt_id, nummer, maskin_id'), 'id'),
    sb.from('objekt_traktgrans').select('objekt_id'),
  ]);
  for (const [vad, r] of [['objekt', o], ['objekt_skogsdata', s], ['dim_objekt', dim], ['objekt_alt_nummer', alt], ['objekt_traktgrans', grans]] as const) {
    if (r.error) { svar.fel.push(`${vad}: ${r.error.message ?? r.error}`); return svar; }
  }
  type Obj = { id: string; namn: string | null; status: string | null; fas: string | null; typ: string; vo_nummer: string | null; dim_objekt_id: string | null; app_prognos: unknown; avslutad_timestamp: string | null };
  const objekt = (o.data ?? []) as Obj[];
  const sparat = new Map(((s.data ?? []) as { objekt_id: string; uttag: SparatUttag | null }[]).map((x) => [x.objekt_id, x.uttag]));
  const harGrans = new Set(((grans.data ?? []) as { objekt_id: string }[]).map((x) => x.objekt_id));

  // Aktiva först (det är dem prognosen gäller), sedan avslutade som aldrig räknats, nyast först.
  const ko = objekt
    .filter((x) => sparat.has(x.id) && (AKTIVA.includes(x.status ?? '') || sparat.get(x.id) == null))
    .sort((a, b) => Number(AKTIVA.includes(b.status ?? '')) - Number(AKTIVA.includes(a.status ?? '')) || (b.avslutad_timestamp ?? '').localeCompare(a.avslutad_timestamp ?? ''));

  for (let i = 0; i < ko.length; i++) {
    if (nu() - start > opt.budgetMs) { svar.kvar = ko.length - i; break; }
    const x = ko[i];
    try {
      const ids = [...objektIds({ id: x.id, vo_nummer: x.vo_nummer, dim_objekt_id: x.dim_objekt_id } as never, dim.data, alt.data)];
      const avslutad = !AKTIVA.includes(x.status ?? '');
      const klar = avslutad || SKORDAT_KLART.includes(x.fas ?? '');
      const st = ids.length ? await sb.rpc('skogsdata_stammar', { p_ids: ids }) : { data: { stammar: [], utan: { antal: 0, vol: 0 } }, error: null };
      if (st.error) { svar.fel.push(`${x.namn ?? x.id}: stammarna: ${st.error.message}`); continue; }
      const data = st.data as StamSvar;
      const antal = (data?.stammar?.length ?? 0) + (data?.utan?.antal ?? 0);
      const forra = sparat.get(x.id);
      if (forra && forra.antal === antal && forra.klar === klar) continue;
      const r = await sb.from('objekt_skogsdata').select('rutnat').eq('objekt_id', x.id).maybeSingle();
      if (r.error || !r.data) { svar.fel.push(`${x.namn ?? x.id}: rutnätet: ${r.error?.message ?? 'saknas'}`); continue; }
      const uttag = raknaUttag(r.data.rutnat as SparatRutnat[], data, klar, avslutad, new Date(nu()));
      const u = await sb.from('objekt_skogsdata').update({ uttag }).eq('objekt_id', x.id);
      if (u.error) { svar.fel.push(`${x.namn ?? x.id}: ${u.error.message}`); continue; }
      svar.raknade.push(x.namn ?? x.id);
    } catch (e) {
      svar.fel.push(`${x.namn ?? x.id}: ${(e as Error)?.message ?? 'okänt fel'}`);
    }
  }

  // Appens prognos fryses för aktiva trakter som saknar en — när laserdatan finns, eller när trakten saknar traktgräns (då kommer den aldrig).
  const attFrysa = objekt.filter((x) => x.app_prognos == null && ['oplanerad', 'planerad', 'pagaende'].includes(x.status ?? '') && (sparat.has(x.id) || !harGrans.has(x.id)));
  if (attFrysa.length && nu() - start <= opt.budgetMs) {
    const utfall = await hamtaUtfall(sb);
    if (utfall.error || !utfall.data) svar.fel.push(`utfallet: ${utfall.error}`);
    else for (const x of attFrysa) {
      if (nu() - start > opt.budgetMs) break;
      const f = await frysAppPrognos(sb, x.id, { kalla: 'laser', utfall: utfall.data });
      if (f.status === 'fryst') svar.frysta.push(x.namn ?? x.id);
      else if (f.status === 'fel') svar.fel.push(`${x.namn ?? x.id}: prognosen: ${f.fel}`);
    }
  }
  return svar;
}
