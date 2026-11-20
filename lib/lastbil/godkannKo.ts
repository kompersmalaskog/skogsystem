// Producenten för påminnelsen "N flyttar väntar på godkännande" (lib/lastbil/godkannNotis). Körs av /api/notis/flush (cron var 5:e minut),
// så ingen ny cron och ingen migration behövs. Köar bara på måndagen från 07:00 och bara när något väntar; dedup på (typ, mottagare_id,
// dedup_nyckel) = en gång per måndag hur ofta flush än kör. Ett fel här får aldrig stoppa resten av kön: flush fångar det.

import type { SupabaseClient } from '@supabase/supabase-js';
import { FLYTT_GODKANN, godkannKoNyckel, type VantandeUnderlag } from './godkannNotis';

export type KoRapport = { ok: boolean; vantar: number; koade: number; fel?: string };

/** Samma urval som raden i Lastbilen (useVantar): aktiv, ej fakturerad, ej godkänd. */
export async function lasVantandeUnderlag(sb: SupabaseClient): Promise<{ rader: VantandeUnderlag[] | null; fel?: string }> {
  const r = await sb.from('fakturaunderlag_flytt').select('id, datum, km')
    .eq('status', 'aktiv').is('fakturerad_tid', null).is('godkand_tid', null).limit(1000);
  if (r.error) return { rader: null, fel: r.error.message };
  return { rader: ((r.data ?? []) as { id: string; datum: string | null; km: number | string | null }[]).map(x => ({ id: x.id, datum: x.datum, km: x.km == null ? null : Number(x.km) })) };
}

export async function koaGodkannPaminnelse(sb: SupabaseClient, nu: Date = new Date()): Promise<KoRapport> {
  const nyckel = godkannKoNyckel(nu);
  if (!nyckel) return { ok: true, vantar: 0, koade: 0 };
  const v = await lasVantandeUnderlag(sb);
  if (!v.rader) return { ok: false, vantar: 0, koade: 0, fel: `fakturaunderlag_flytt: ${v.fel}` };
  if (v.rader.length === 0) return { ok: true, vantar: 0, koade: 0 };

  const m = await sb.from('medarbetare').select('id, aktiv').eq('roll', 'admin');
  if (m.error) return { ok: false, vantar: v.rader.length, koade: 0, fel: `medarbetare: ${m.error.message}` };
  const mottagare = ((m.data ?? []) as { id: string; aktiv: boolean | null }[]).filter(x => x.aktiv !== false);
  if (mottagare.length === 0) return { ok: false, vantar: v.rader.length, koade: 0, fel: 'Ingen aktiv admin att påminna' };

  const rader = mottagare.map(x => ({ mottagare_id: x.id, typ: FLYTT_GODKANN, payload: {}, skickas_at: nu.toISOString(), dedup_nyckel: nyckel }));
  const ins = await sb.from('notis_kö').upsert(rader, { onConflict: 'typ,mottagare_id,dedup_nyckel', ignoreDuplicates: true }).select('dedup_nyckel');
  if (ins.error) return { ok: false, vantar: v.rader.length, koade: 0, fel: `notis_kö: ${ins.error.message}` };
  return { ok: true, vantar: v.rader.length, koade: (ins.data ?? []).length };
}
