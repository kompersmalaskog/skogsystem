/**
 * Väderkollen på servern: "har vädret slagit om sedan maskinen körde senast?" (lib/kalibrering/vaderOmslag har regeln).
 * EN läsning (`lasVaderLage`) för Läget-raden (/api/kalibrering/vader) och pushen `kalib_vader` (/api/notis/flush).
 *
 * Maskinens position = sista hyttspårspunkten (RPC maskin_senaste_position). "Då" = när maskinen SLUTADE förra arbetsdagen (senaste hyttspårsraden före
 * idag, högst en vecka bakåt) — Martin 2026-11-19: inte senaste kontrollen, för har det slagit om under kvällen ska man mäta direkt på morgonen.
 * Stationen = närmaste aktiva SMHI-station inom 60 km som har värden.
 *
 * Pushen: på MORGONEN när föraren startar — en push mitt på dagen (solen tinar barken och det fryser igen till kvällen) vore tjat. Start = dagens första
 * hyttspårsrad för maskinen (hyttspar.skapad_at, svensk dag); omslaget prövas bara inom START_FONSTER_MS efter starten, högst en push per maskin och dag
 * (dedup `vader:<maskin>:<dag>`), till förarna med maskinen (medarbetare.maskin_id). Under dagen syns vädret bara i Läget. Köas med skickas_at = 'infinity'
 * (den gamla flushen på production skickar okända typer som en generisk "Notis"). Texten byggs FÄRSKT: inget omslag längre eller en kontroll gjord sedan
 * köandet → ingen push, läsfel → uppskjuts, köad för mer än 6 h sedan → hoppas över.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { optiTidUtcMs } from '@/lib/optiTid';
import { hamtaObservationer, hamtaStationer, narmasteStationer } from '@/lib/smhi-obs';
import { svenskDag } from './matdon';
import { omslagText, vaderLage, type VaderLage } from './vaderOmslag';

export const KALIB_VADER = 'kalib_vader';
export const arVaderNotis = (typ: unknown): typ is typeof KALIB_VADER => typ === KALIB_VADER;
export const VADER_MAX_ALDER_MS = 6 * 3_600_000;
/** Hur länge efter starten på morgonen omslaget prövas. Efter det är det dag, och då pushar vi inte. */
export const START_FONSTER_MS = 2 * 3_600_000;
/** Så långt bakåt letas förra arbetsdagen (en helg och en ledig dag ryms). */
export const SLUT_MAX_DAGAR = 7;
const POSITION_MAX_ALDER_MS = 14 * 86_400_000;

export type VaderSvar =
  | {
    ok: true; lage: VaderLage; station: string | null;
    /** När maskinen slutade förra arbetsdagen. null = ingen arbetsdag senaste veckan. */
    slutMs: number | null;
    /** Senaste kontrollmätningen (operatörens mätning). null = ingen. */
    kontrollMs: number | null;
    /** Klockslaget för en kontroll gjord sedan maskinen startade idag (svensk tid). null = ingen idag. */
    kontrollIdag: string | null;
  }
  | { ok: false; orsak: 'position' | 'station' | 'las'; fel?: string };

const klockslag = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
const dagMinus = (dag: string, n: number) => new Date(Date.parse(`${dag}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** Senaste kontrollmätningens tid (ms). null = ingen; undefined = läsfel. */
async function senasteKontroll(sb: SupabaseClient, maskin: string): Promise<number | null | undefined> {
  const r = await sb.from('detalj_kontroll_stock').select('operator_measurement_date,tid_ar_utc')
    .eq('maskin_id', maskin).not('operator_measurement_date', 'is', null)
    .order('operator_measurement_date', { ascending: false }).limit(50);
  if (r.error) return undefined;
  let bast: number | null = null;
  for (const x of (r.data ?? []) as { operator_measurement_date: string; tid_ar_utc: boolean | null }[]) {
    const ms = optiTidUtcMs(x.operator_measurement_date, x.tid_ar_utc);
    if (ms != null && (bast == null || ms > bast)) bast = ms;
  }
  return bast;
}

/** När maskinen slutade förra arbetsdagen: sista skrivningen i hyttspåret en dag före idag (högst SLUT_MAX_DAGAR bakåt). null = ingen; undefined = läsfel. */
export async function slutForraDagen(sb: SupabaseClient, maskin: string, nu: Date): Promise<number | null | undefined> {
  const idag = svenskDag(nu.toISOString());
  const r = await sb.from('hyttspar').select('skapad_at,uppdaterad_at').eq('maskin_id', maskin)
    .lt('datum', idag).gte('datum', dagMinus(idag, SLUT_MAX_DAGAR))
    .order('datum', { ascending: false }).limit(50);
  if (r.error) return undefined;
  let bast: number | null = null;
  for (const x of (r.data ?? []) as { skapad_at: string | null; uppdaterad_at: string | null }[]) {
    const ms = Date.parse(x.uppdaterad_at ?? x.skapad_at ?? '');
    if (Number.isFinite(ms) && ms < nu.getTime() && (bast == null || ms > bast)) bast = ms;
  }
  return bast;
}

export async function lasVaderLage(sb: SupabaseClient, maskin: string, nu = new Date(), hamta: typeof fetch = fetch): Promise<VaderSvar> {
  const pos = await sb.rpc('maskin_senaste_position');
  if (pos.error) return { ok: false, orsak: 'las', fel: `position: ${pos.error.message}` };
  const p = ((pos.data ?? []) as { maskin_id: string; lat: number | null; lng: number | null; tid: string | null }[])
    .find(x => x.maskin_id === maskin && x.lat != null && x.lng != null);
  if (!p || (p.tid && nu.getTime() - Date.parse(p.tid) > POSITION_MAX_ALDER_MS)) return { ok: false, orsak: 'position' };

  const [kontrollMs, slutMs, startMs] = await Promise.all([senasteKontroll(sb, maskin), slutForraDagen(sb, maskin, nu), startIdag(sb, maskin, nu)]);
  if (kontrollMs === undefined) return { ok: false, orsak: 'las', fel: 'kontroller' };
  if (slutMs === undefined || startMs === undefined) return { ok: false, orsak: 'las', fel: 'hyttspar' };
  const kontrollIdag = kontrollMs != null && startMs != null && kontrollMs >= startMs ? klockslag(kontrollMs) : null;

  const stationer = await hamtaStationer(hamta, nu.getTime());
  if (!stationer) return { ok: false, orsak: 'station' };
  for (const s of narmasteStationer({ lat: p.lat!, lon: p.lng! }, stationer).slice(0, 3)) {
    const obs = await hamtaObservationer(s.key, hamta, nu.getTime());
    if (!obs) continue;
    const lage = vaderLage({ obs, slutMs, nuMs: nu.getTime() });
    if (lage.nu == null) continue; // stationen har inga färska värden — prova nästa
    return { ok: true, lage, station: s.namn, slutMs, kontrollMs, kontrollIdag };
  }
  return { ok: false, orsak: 'station' };
}

/** När maskinen startade idag (svensk dag): dagens första hyttspårsrad. null = inte startad idag; undefined = läsfel. */
export async function startIdag(sb: SupabaseClient, maskin: string, nu: Date): Promise<number | null | undefined> {
  const r = await sb.from('hyttspar').select('skapad_at').eq('maskin_id', maskin).eq('datum', svenskDag(nu.toISOString()))
    .order('skapad_at', { ascending: true }).limit(1);
  if (r.error) return undefined;
  const t = (r.data?.[0] as { skapad_at?: string | null } | undefined)?.skapad_at;
  const ms = t ? Date.parse(t) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/** Morgonfönstret: startad idag och högst START_FONSTER_MS sedan. */
export const iMorgonfonstret = (startMs: number | null, nu: Date): boolean =>
  startMs != null && nu.getTime() >= startMs && nu.getTime() - startMs <= START_FONSTER_MS;

/** Var kvart (flushen går var 5:e minut — vi läser SMHI fyra gånger i timmen, inte tolv). */
export const dagsAttKollaVader = (nu: Date): boolean => nu.getUTCMinutes() % 15 < 5;

export const vaderDedup = (maskin: string, nu: Date): string => `vader:${maskin}:${svenskDag(nu.toISOString())}`;

export type VaderUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string }
  | { typ: 'uppskjut' };

export type HamtaVader = (maskin: string) => Promise<{ namn: string; svar: VaderSvar } | null>;

export async function byggVaderNotis(
  n: { payload?: Record<string, unknown> | null; skapad_at?: string | null; dedup_nyckel?: string | null },
  hamta: HamtaVader,
  nu: Date = new Date(),
): Promise<VaderUtfall> {
  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu.getTime() - koad > VADER_MAX_ALDER_MS) return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 6 timmar sedan)' };
  const maskin = typeof n.payload?.maskin_id === 'string' ? n.payload.maskin_id : null;
  if (!maskin) return { typ: 'hoppa_over', orsak: 'Ej skickad — maskin saknas i notisen' };
  const d = await hamta(maskin);
  if (!d || (!d.svar.ok && d.svar.orsak === 'las')) return { typ: 'uppskjut' };
  if (!d.svar.ok) return { typ: 'hoppa_over', orsak: 'Ej skickad — vädret går inte att läsa för maskinen' };
  const koadMs = typeof n.payload?.koad_ms === 'number' ? n.payload.koad_ms : (Number.isFinite(koad) ? koad : null);
  if (koadMs != null && d.svar.kontrollMs != null && d.svar.kontrollMs > koadMs) return { typ: 'hoppa_over', orsak: 'Ej skickad — en kontroll är gjord' };
  const text = omslagText(d.namn, d.svar.lage, d.svar.slutMs, nu.getTime());
  if (!text) return { typ: 'hoppa_over', orsak: 'Ej skickad — vädret är som när maskinen slutade igen' };
  return { typ: 'skicka', meddelande: { ...text, url: `/kalibrering?maskin=${encodeURIComponent(maskin)}`, tag: n.dedup_nyckel ?? `vader:${maskin}` } };
}

export function lasVader(sb: SupabaseClient): HamtaVader {
  return async maskin => {
    try {
      const m = await sb.from('dim_maskin').select('visningsnamn').eq('maskin_id', maskin).maybeSingle();
      if (m.error) return null;
      const svar = await lasVaderLage(sb, maskin);
      return { namn: (m.data as { visningsnamn?: string | null } | null)?.visningsnamn?.trim() || 'maskinen', svar };
    } catch { return null; }
  };
}

export type VaderKoRapport = { ok: boolean; koade: number; hoppade?: string; fel?: string };

/** Producenten. Fel kvart → inga läsningar. Bara maskiner i morgonfönstret läser vädret. Ett fel för en maskin stoppar inte de andra. */
export async function koaVaderOmslag(sb: SupabaseClient, nu: Date = new Date(), hamta: typeof fetch = fetch): Promise<VaderKoRapport> {
  if (!dagsAttKollaVader(nu)) return { ok: true, koade: 0, hoppade: 'inte dags' };
  const idag = svenskDag(nu.toISOString());
  const mk = await sb.from('dim_maskin').select('maskin_id, aktiv_till').eq('maskin_typ', 'Harvester');
  if (mk.error) return { ok: false, koade: 0, fel: `dim_maskin: ${mk.error.message}` };
  const maskiner = ((mk.data ?? []) as { maskin_id: string; aktiv_till: string | null }[])
    .filter(m => !m.aktiv_till || m.aktiv_till >= idag).map(m => m.maskin_id);

  let koade = 0;
  const fel: string[] = [];
  for (const maskin of maskiner) {
    const start = await startIdag(sb, maskin, nu);
    if (start === undefined) { fel.push(`${maskin}: hyttspar`); continue; }
    if (!iMorgonfonstret(start, nu)) continue;
    const dedup = vaderDedup(maskin, nu);
    const redan = await sb.from('notis_kö').select('id').eq('typ', KALIB_VADER).eq('dedup_nyckel', dedup).limit(1);
    if (redan.error) { fel.push(`${maskin}: ${redan.error.message}`); continue; }
    if ((redan.data ?? []).length > 0) continue;

    let svar: VaderSvar;
    try { svar = await lasVaderLage(sb, maskin, nu, hamta); } catch (e) { fel.push(`${maskin}: ${(e as Error).message}`); continue; }
    if (!svar.ok) { if (svar.orsak === 'las') fel.push(`${maskin}: ${svar.fel}`); continue; }
    if (!svar.lage.omslag || svar.slutMs == null || svar.lage.nu == null || svar.kontrollIdag) continue;

    const f = await sb.from('medarbetare').select('id, aktiv').eq('maskin_id', maskin);
    if (f.error) { fel.push(`${maskin}: ${f.error.message}`); continue; }
    const mottagare = ((f.data ?? []) as { id: string; aktiv: boolean | null }[]).filter(x => x.aktiv !== false);
    if (mottagare.length === 0) continue;

    const ins = await sb.from('notis_kö')
      .upsert(mottagare.map(x => ({ mottagare_id: x.id, typ: KALIB_VADER, payload: { maskin_id: maskin, koad_ms: nu.getTime() }, skickas_at: 'infinity', dedup_nyckel: dedup })),
        { onConflict: 'typ,mottagare_id,dedup_nyckel', ignoreDuplicates: true })
      .select('dedup_nyckel');
    if (ins.error) { fel.push(`${maskin}: ${ins.error.message}`); continue; }
    koade += (ins.data ?? []).length;
  }
  return fel.length ? { ok: false, koade, fel: fel.join('; ') } : { ok: true, koade };
}
