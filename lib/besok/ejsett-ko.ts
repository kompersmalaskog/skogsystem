// Producenten för "maskinen har inte sett besöket": läser aktiva besök, bestämmer vilka maskiner som ska ha sett dem och köar EN push per planerare, besök och maskin (valjEjSett).
// Körs av /api/notis/flush (cron var 5:e minut), så pushen kommer 10–15 minuter efter anmälan. Dedup: unikt index (typ, mottagare_id, dedup_nyckel). Ett fel här stoppar aldrig resten av kön.

import type { SupabaseClient } from '@supabase/supabase-js';
import { BESOK_EFTERTID_MIN } from './konstanter';
import { BESOK_EJ_SETT, valjEjSett, type EjSettBesok } from './ejsett';
import { maskinerPaObjekt } from './maskinerPaBesok';

export type EjSettRapport = { ok: boolean; kandidater: number; koade: number; fel?: string };

export async function koaBesokEjSett(sb: SupabaseClient, nu: Date = new Date()): Promise<EjSettRapport> {
  const fran = new Date(nu.getTime() - BESOK_EFTERTID_MIN * 60000).toISOString();
  const b = await sb.from('objekt_besok').select('id, objekt_id, besokstid, skapad_at').gte('besokstid', fran);
  if (b.error) return { ok: false, kandidater: 0, koade: 0, fel: `objekt_besok: ${b.error.message}` };
  const besok = (b.data ?? []) as EjSettBesok[];
  if (besok.length === 0) return { ok: true, kandidater: 0, koade: 0 };

  const objektIds = Array.from(new Set(besok.map((x) => x.objekt_id)));
  const o = await sb.from('objekt').select('id, status').in('id', objektIds);
  if (o.error) return { ok: false, kandidater: 0, koade: 0, fel: `objekt: ${o.error.message}` };
  const oppna = new Set(((o.data ?? []) as { id: string; status: string | null }[]).filter((x) => x.status !== 'avslutat' && x.status !== 'klar').map((x) => x.id));
  const levande = besok.filter((x) => oppna.has(x.objekt_id));
  if (levande.length === 0) return { ok: true, kandidater: 0, koade: 0 };

  const k = await sb.from('objekt_besok_kvittens').select('besok_id, maskin_id').in('besok_id', levande.map((x) => x.id));
  if (k.error) return { ok: false, kandidater: 0, koade: 0, fel: `objekt_besok_kvittens: ${k.error.message}` };

  let maskiner;
  try { maskiner = await maskinerPaObjekt(sb, Array.from(new Set(levande.map((x) => x.objekt_id))), nu); }
  catch (e) { return { ok: false, kandidater: 0, koade: 0, fel: e instanceof Error ? e.message : String(e) }; }

  const kandidater = valjEjSett(levande, maskiner, (k.data ?? []) as { besok_id: string; maskin_id: string }[], nu);
  if (kandidater.length === 0) return { ok: true, kandidater: 0, koade: 0 };

  const m = await sb.from('medarbetare').select('id, aktiv').eq('roll', 'admin');
  if (m.error) return { ok: false, kandidater: kandidater.length, koade: 0, fel: `medarbetare: ${m.error.message}` };
  const mottagare = ((m.data ?? []) as { id: string; aktiv: boolean | null }[]).filter((x) => x.aktiv !== false);
  if (mottagare.length === 0) return { ok: false, kandidater: kandidater.length, koade: 0, fel: 'Ingen aktiv planerare (admin) att varna' };

  const skickasAt = nu.toISOString();
  const rader = kandidater.flatMap((c) => mottagare.map((x) => ({
    mottagare_id: x.id, typ: BESOK_EJ_SETT, payload: { besok_id: c.besokId, maskin_id: c.maskinId, objekt_id: c.objektId }, skickas_at: skickasAt, dedup_nyckel: c.nyckel,
  })));
  const ins = await sb.from('notis_kö').upsert(rader, { onConflict: 'typ,mottagare_id,dedup_nyckel', ignoreDuplicates: true }).select('dedup_nyckel');
  if (ins.error) return { ok: false, kandidater: kandidater.length, koade: 0, fel: `notis_kö: ${ins.error.message}` };
  return { ok: true, kandidater: kandidater.length, koade: (ins.data ?? []).length };
}
