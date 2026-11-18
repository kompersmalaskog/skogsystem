/**
 * Väderkollen på servern: "har vädret ändrat sig sedan senaste kontrollen?" (lib/kalibrering/vaderOmslag har regeln).
 * EN läsning (`lasVaderLage`) för Läget-raden (/api/kalibrering/vader) och pushen `kalib_vader` (/api/notis/flush).
 *
 * Maskinens position = sista hyttspårspunkten (RPC maskin_senaste_position). Senaste kontrollen = senaste operatörsmätningen i
 * detalj_kontroll_stock (Opti-tid via lib/optiTid, aldrig rått). Stationen = närmaste aktiva SMHI-station inom 60 km som har värden.
 *
 * Pushen: till förarna med maskinen (medarbetare.maskin_id), 06–20 svensk tid, en per kontroll och väderläge
 * (dedup `vader:<maskin>:<kontroll-ms>:<läge>`) — gör föraren en ny kontroll är det ett nytt utgångsläge. Köas med skickas_at = 'infinity'
 * (den gamla flushen på production skickar okända typer som en generisk "Notis"). Texten byggs FÄRSKT: inget omslag längre eller en ny
 * kontroll sedan köandet → ingen push, läsfel → uppskjuts, köad för mer än 6 h sedan → hoppas över.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { optiTidUtcMs } from '@/lib/optiTid';
import { hamtaObservationer, hamtaStationer, narmasteStationer } from '@/lib/smhi-obs';
import { fmtDagMan } from './datum';
import { svenskDag } from './matdon';
import { omslagText, vaderKlass, vaderLage, type VaderLage } from './vaderOmslag';

export const KALIB_VADER = 'kalib_vader';
export const arVaderNotis = (typ: unknown): typ is typeof KALIB_VADER => typ === KALIB_VADER;
export const VADER_MAX_ALDER_MS = 6 * 3_600_000;
const POSITION_MAX_ALDER_MS = 14 * 86_400_000;

export type VaderSvar =
  | { ok: true; lage: VaderLage; station: string | null; kontrollMs: number | null; kontrollDag: string | null }
  | { ok: false; orsak: 'position' | 'station' | 'las'; fel?: string };

/** Senaste kontrollens tid (ms) och kontrollens eget väder (ERA5) som reserv. */
async function senasteKontroll(sb: SupabaseClient, maskin: string): Promise<{ ms: number | null; temp: number | null } | null> {
  const r = await sb.from('detalj_kontroll_stock').select('filnamn,operator_measurement_date,tid_ar_utc')
    .eq('maskin_id', maskin).not('operator_measurement_date', 'is', null)
    .order('operator_measurement_date', { ascending: false }).limit(50);
  if (r.error) return null;
  let bast: { ms: number; filnamn: string } | null = null;
  for (const x of (r.data ?? []) as { filnamn: string; operator_measurement_date: string; tid_ar_utc: boolean | null }[]) {
    const ms = optiTidUtcMs(x.operator_measurement_date, x.tid_ar_utc);
    if (ms != null && (!bast || ms > bast.ms)) bast = { ms, filnamn: x.filnamn };
  }
  if (!bast) return { ms: null, temp: null };
  const k = await sb.from('fakt_kalibrering').select('weather_at_harvest').eq('filnamn', bast.filnamn).limit(1);
  const w = (k.data?.[0] as { weather_at_harvest?: { temperature_c?: number | null } | null } | undefined)?.weather_at_harvest;
  return { ms: bast.ms, temp: typeof w?.temperature_c === 'number' ? w.temperature_c : null };
}

export async function lasVaderLage(sb: SupabaseClient, maskin: string, nu = new Date(), hamta: typeof fetch = fetch): Promise<VaderSvar> {
  const pos = await sb.rpc('maskin_senaste_position');
  if (pos.error) return { ok: false, orsak: 'las', fel: `position: ${pos.error.message}` };
  const p = ((pos.data ?? []) as { maskin_id: string; lat: number | null; lng: number | null; tid: string | null }[])
    .find(x => x.maskin_id === maskin && x.lat != null && x.lng != null);
  if (!p || (p.tid && nu.getTime() - Date.parse(p.tid) > POSITION_MAX_ALDER_MS)) return { ok: false, orsak: 'position' };

  const kontroll = await senasteKontroll(sb, maskin);
  if (!kontroll) return { ok: false, orsak: 'las', fel: 'kontroller' };

  const stationer = await hamtaStationer(hamta, nu.getTime());
  if (!stationer) return { ok: false, orsak: 'station' };
  for (const s of narmasteStationer({ lat: p.lat!, lon: p.lng! }, stationer).slice(0, 3)) {
    const obs = await hamtaObservationer(s.key, hamta, nu.getTime());
    if (!obs) continue;
    const lage = vaderLage({ obs, kontrollMs: kontroll.ms, kontrollTemp: kontroll.temp, nuMs: nu.getTime() });
    if (lage.nu == null) continue; // stationen har inga färska värden — prova nästa
    return {
      ok: true, lage, station: s.namn, kontrollMs: kontroll.ms,
      kontrollDag: kontroll.ms != null ? fmtDagMan(svenskDag(new Date(kontroll.ms).toISOString())) : null,
    };
  }
  return { ok: false, orsak: 'station' };
}

const timmeSthlm = (nu: Date): number =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: '2-digit', hourCycle: 'h23' }).format(nu));

/** 06–20 svensk tid, var kvart (flushen går var 5:e minut — vi läser SMHI fyra gånger i timmen, inte tolv). */
export const dagsAttKollaVader = (nu: Date): boolean => {
  const h = timmeSthlm(nu);
  return h >= 6 && h < 20 && nu.getUTCMinutes() % 15 < 5;
};

export const vaderDedup = (maskin: string, kontrollMs: number, nu: number): string => `vader:${maskin}:${kontrollMs}:${vaderKlass(nu)}`;

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
  const koadKontroll = typeof n.payload?.kontroll_ms === 'number' ? n.payload.kontroll_ms : null;
  if (koadKontroll != null && d.svar.kontrollMs != null && d.svar.kontrollMs > koadKontroll) return { typ: 'hoppa_over', orsak: 'Ej skickad — en ny kontroll är gjord' };
  const text = omslagText(d.namn, d.svar.lage, d.svar.kontrollDag);
  if (!text) return { typ: 'hoppa_over', orsak: 'Ej skickad — vädret är som vid senaste kontrollen igen' };
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

/** Producenten. Utanför 06–20 eller fel kvart → inga läsningar. Ett fel för en maskin stoppar inte de andra. */
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
    let svar: VaderSvar;
    try { svar = await lasVaderLage(sb, maskin, nu, hamta); } catch (e) { fel.push(`${maskin}: ${(e as Error).message}`); continue; }
    if (!svar.ok) { if (svar.orsak === 'las') fel.push(`${maskin}: ${svar.fel}`); continue; }
    if (!svar.lage.omslag || svar.kontrollMs == null || svar.lage.nu == null) continue;

    const dedup = vaderDedup(maskin, svar.kontrollMs, svar.lage.nu);
    const redan = await sb.from('notis_kö').select('id').eq('typ', KALIB_VADER).eq('dedup_nyckel', dedup).limit(1);
    if (redan.error) { fel.push(`${maskin}: ${redan.error.message}`); continue; }
    if ((redan.data ?? []).length > 0) continue;

    const f = await sb.from('medarbetare').select('id, aktiv').eq('maskin_id', maskin);
    if (f.error) { fel.push(`${maskin}: ${f.error.message}`); continue; }
    const mottagare = ((f.data ?? []) as { id: string; aktiv: boolean | null }[]).filter(x => x.aktiv !== false);
    if (mottagare.length === 0) continue;

    const ins = await sb.from('notis_kö')
      .upsert(mottagare.map(x => ({ mottagare_id: x.id, typ: KALIB_VADER, payload: { maskin_id: maskin, kontroll_ms: svar.kontrollMs }, skickas_at: 'infinity', dedup_nyckel: dedup })),
        { onConflict: 'typ,mottagare_id,dedup_nyckel', ignoreDuplicates: true })
      .select('dedup_nyckel');
    if (ins.error) { fel.push(`${maskin}: ${ins.error.message}`); continue; }
    koade += (ins.data ?? []).length;
  }
  return fel.length ? { ok: false, koade, fel: fel.join('; ') } : { ok: true, koade };
}
