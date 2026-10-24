// Producenten för besökspåminnelsen: läser öppna objekt, väljer dem som ska påminnas idag (lib/besok/paminnelse) och lägger en rad per planerare i notis_kö. Körs av /api/notis/flush
// (cron var 5:e minut), så ingen ny cron behövs. Dedup: unikt index (typ, mottagare_id, dedup_nyckel) — samma tillfälle köas aldrig två gånger, hur ofta flush än kör.
// Ett fel här får aldrig stoppa resten av kön: flush fångar det.

import type { SupabaseClient } from '@supabase/supabase-js';
import { BESOK_PAMINNELSE, valjPaminnelser, type PaminnelseObjekt } from './paminnelse';

export type KoRapport = { ok: boolean; kandidater: number; koade: number; fel?: string };

export async function koaBesokPaminnelser(sb: SupabaseClient, nu: Date = new Date()): Promise<KoRapport> {
  const o = await sb.from('objekt').select('id, namn, status, planerad_start, pagaende_startad_timestamp').not('status', 'in', '(avslutat,klar)');
  if (o.error) return { ok: false, kandidater: 0, koade: 0, fel: `objekt: ${o.error.message}` };
  const objekt = (o.data ?? []) as PaminnelseObjekt[];
  if (objekt.length === 0) return { ok: true, kandidater: 0, koade: 0 };

  // Bara objekt som kan bli aktuella behöver sms-kontrollen; ett läsfel är ett fel (ingen påminnelse på gissning, inget "redan skickat" på gissning).
  // Bara BEKRÄFTAT skickade räknas (handelse = 'skickad'): att knappen trycktes eller texten kopierades tystar inte påminnelsen.
  const s = await sb.from('objekt_besok_sms').select('objekt_id').eq('handelse', 'skickad').in('objekt_id', objekt.map((x) => x.id));
  if (s.error) return { ok: false, kandidater: 0, koade: 0, fel: `objekt_besok_sms: ${s.error.message}` };
  const harSms = new Set(((s.data ?? []) as { objekt_id: string }[]).map((x) => x.objekt_id));

  const kandidater = valjPaminnelser(objekt, harSms, nu);
  if (kandidater.length === 0) return { ok: true, kandidater: 0, koade: 0 };

  const m = await sb.from('medarbetare').select('id, aktiv').eq('roll', 'admin');
  if (m.error) return { ok: false, kandidater: kandidater.length, koade: 0, fel: `medarbetare: ${m.error.message}` };
  const mottagare = ((m.data ?? []) as { id: string; aktiv: boolean | null }[]).filter((x) => x.aktiv !== false);
  if (mottagare.length === 0) return { ok: false, kandidater: kandidater.length, koade: 0, fel: 'Ingen aktiv planerare (admin) att påminna' };

  const skickasAt = nu.toISOString();
  const rader = kandidater.flatMap((k) => mottagare.map((x) => ({
    mottagare_id: x.id, typ: BESOK_PAMINNELSE, payload: { objekt_id: k.objektId, nar: k.nar }, skickas_at: skickasAt, dedup_nyckel: k.nyckel,
  })));
  const ins = await sb.from('notis_kö').upsert(rader, { onConflict: 'typ,mottagare_id,dedup_nyckel', ignoreDuplicates: true }).select('dedup_nyckel');
  if (ins.error) return { ok: false, kandidater: kandidater.length, koade: 0, fel: `notis_kö: ${ins.error.message}` };
  return { ok: true, kandidater: kandidater.length, koade: (ins.data ?? []).length };
}
