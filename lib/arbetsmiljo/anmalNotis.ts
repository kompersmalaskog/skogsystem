/**
 * Påminnelsen om anmälan till Arbetsmiljöverket (arbetsmiljö, 2026-11-02).
 *
 * En OLYCKA som inte markerats anmäld två timmar efter rapporten → EN push till aktiva admin (arbetsgivaren anmäler):
 *   "Är olyckan anmäld?" · "Olycka · Giant · Trädet föll … Allvarliga olyckor anmäls till Arbetsmiljöverket." → /atgarder?id=<åtgärd>
 *
 * Bara olyckor: appen vet inte om ett tillbud var allvarligt, och en påminnelse om varje "det var nära" vore brus.
 * Allvarliga tillbud står i åtgärdsarket (sektionen Arbetsmiljöverket) som förut.
 *
 * KÖAS av producenten koaAnmalPaminnelse (körs av /api/notis/flush) med skickas_at = 'infinity', som am_stopp och am_tillbud:
 * den GAMLA flushen på production skickar okända typer som en generisk "Notis". dedup = tillbudets id → en gång per olycka.
 * Texten byggs FÄRSKT: anmäld eller borta → ingenting skickas, läsfel → uppskjuts, köad för mer än 24 h sedan → hoppas över.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { kortaText } from './stoppNotis';

export const AM_ANMAL = 'am_anmal';
export const arAnmalNotis = (typ: unknown): typ is typeof AM_ANMAL => typ === AM_ANMAL;

/** Så länge efter rapporten innan påminnelsen går. "Utan dröjsmål" — men ge admin chansen att göra det själv först. */
export const ANMAL_EFTER_MS = 2 * 60 * 60 * 1000;
/** Äldre olyckor påminns inte (de rapporterades innan påminnelsen fanns, eller har redan påmints). */
export const ANMAL_FONSTER_MS = 7 * 24 * 60 * 60 * 1000;
export const ANMAL_MAX_ALDER_MS = 24 * 60 * 60 * 1000;

export type AnmalRad = {
  tillbud_id: string;
  atgard_id: string | null;
  typ: 'tillbud' | 'olycka';
  anmald: boolean;
  beskrivning: string;
  maskin_namn: string | null;
};

export type HamtaAnmal = (tillbudId: string) => Promise<{ rad: AnmalRad | null; fel?: string }>;

export type AnmalUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string }
  | { typ: 'uppskjut' };

export function anmalText(rad: AnmalRad): { title: string; body: string } {
  const vad = rad.maskin_namn?.trim() ? `Olycka · ${rad.maskin_namn.trim()}` : 'Olycka';
  return { title: 'Är olyckan anmäld?', body: `${vad} · ${kortaText(rad.beskrivning)}. Allvarliga olyckor anmäls till Arbetsmiljöverket.` };
}

export async function byggAnmalNotis(
  n: { typ: string; payload?: Record<string, unknown> | null; skapad_at?: string | null },
  hamta: HamtaAnmal,
  nu: number = Date.now(),
): Promise<AnmalUtfall> {
  const id = n.payload?.tillbud_id;
  if (typeof id !== 'string' || !id) return { typ: 'hoppa_over', orsak: 'Ej skickad — notisen saknar olycka' };
  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > ANMAL_MAX_ALDER_MS) return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' };

  const { rad, fel } = await hamta(id);
  if (fel) return { typ: 'uppskjut' };
  if (!rad) return { typ: 'hoppa_over', orsak: 'Ej skickad — olyckan finns inte längre' };
  if (rad.typ !== 'olycka') return { typ: 'hoppa_over', orsak: 'Ej skickad — inte en olycka' };
  if (rad.anmald) return { typ: 'hoppa_over', orsak: 'Ej skickad — redan anmäld' };

  const url = rad.atgard_id ? `/atgarder?id=${encodeURIComponent(rad.atgard_id)}` : '/atgarder';
  return { typ: 'skicka', meddelande: { ...anmalText(rad), url, tag: `am-anmal-${rad.tillbud_id}` } };
}

export type AnmalKoRapport = { ok: boolean; olyckor: number; koade: number; fel?: string };

/** Producenten: olyckor 2 h–7 dygn gamla som inte är anmälda → en rad per aktiv admin. Ett fel stoppar aldrig resten av kön (flush fångar det). */
export async function koaAnmalPaminnelse(sb: SupabaseClient, nu: Date = new Date()): Promise<AnmalKoRapport> {
  const senast = new Date(nu.getTime() - ANMAL_EFTER_MS).toISOString();
  const tidigast = new Date(nu.getTime() - ANMAL_FONSTER_MS).toISOString();
  const t = await sb.from('am_tillbud').select('id').eq('typ', 'olycka').is('anmald_tid', null).lte('skapad', senast).gte('skapad', tidigast).limit(200);
  if (t.error) return { ok: false, olyckor: 0, koade: 0, fel: `am_tillbud: ${t.error.message}` };
  const olyckor = (t.data ?? []) as { id: string }[];
  if (olyckor.length === 0) return { ok: true, olyckor: 0, koade: 0 };

  const m = await sb.from('medarbetare').select('id, aktiv').eq('roll', 'admin');
  if (m.error) return { ok: false, olyckor: olyckor.length, koade: 0, fel: `medarbetare: ${m.error.message}` };
  const mottagare = ((m.data ?? []) as { id: string; aktiv: boolean | null }[]).filter(x => x.aktiv !== false);
  if (mottagare.length === 0) return { ok: false, olyckor: olyckor.length, koade: 0, fel: 'Ingen aktiv admin att påminna' };

  const rader = olyckor.flatMap(o => mottagare.map(x => ({
    mottagare_id: x.id, typ: AM_ANMAL, payload: { tillbud_id: o.id }, skickas_at: 'infinity', dedup_nyckel: `anmal:${o.id}`,
  })));
  const ins = await sb.from('notis_kö').upsert(rader, { onConflict: 'typ,mottagare_id,dedup_nyckel', ignoreDuplicates: true }).select('dedup_nyckel');
  if (ins.error) return { ok: false, olyckor: olyckor.length, koade: 0, fel: `notis_kö: ${ins.error.message}` };
  return { ok: true, olyckor: olyckor.length, koade: (ins.data ?? []).length };
}
