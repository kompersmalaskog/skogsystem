/**
 * "Ambulansen kommer inte fram" — en push till planerarna när någon svarat Nej vid en larmplats (lib/larmKontroll, 2026-11-10).
 *
 *   "Larmplatsen fungerar inte · Gallring Santhe 2026." / "Avlägg 01-4: bommen är låst · Daniel" → /planering?objekt=<id>
 *
 * KÖAS av producenten koaLarmplatsNej (körs av /api/notis/flush) med skickas_at = 'infinity' — den gamla flushen på production
 * skickar okända typer som en generisk "Notis" (se CLAUDE.md). En rad per svar och aktiv admin (utom den som själv svarade),
 * dedup = svarets id. Bara svar de senaste 24 timmarna. Ingen ny migration utöver tabellen.
 * Texten byggs FÄRSKT: har någon svarat Ja på samma larmplats efteråt (rättat) → ingenting skickas; läsfel → uppskjuts;
 * köad för mer än 24 h sedan → hoppas över.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { kontrollFor, type LarmKontrollRad } from './larmKontroll';

export const LARMPLATS_NEJ = 'larmplats_nej';
export const arLarmplatsNejNotis = (typ: unknown): typ is typeof LARMPLATS_NEJ => typ === LARMPLATS_NEJ;

export const NEJ_FONSTER_MS = 24 * 60 * 60 * 1000;
export const NEJ_MAX_ALDER_MS = 24 * 60 * 60 * 1000;

export type NejRad = {
  id: string; objekt_id: string; objekt_namn: string | null; lat: number; lng: number;
  kommentar: string | null; vem: string | null; skapad_at: string;
  /** Alla svar på objektet — för att se om någon sagt Ja efteråt. */
  alla: LarmKontrollRad[];
  /** Avläggets namn ("Avlägg 01-4 · skbv gräskulla"), om sidan kan räkna fram det; annars null. */
  plats: string | null;
};

export type HamtaNej = (id: string) => Promise<{ rad: NejRad | null; fel?: string }>;

export type NejUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string }
  | { typ: 'uppskjut' };

export function nejText(r: NejRad): { title: string; body: string } {
  const varfor = r.kommentar?.trim();
  const plats = r.plats ?? `Larmplatsen ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`;
  const body = [`${plats}${varfor ? `: ${varfor}` : ' – ambulansen kommer inte fram'}`, r.vem].filter(Boolean).join(' · ');
  return { title: `Larmplatsen fungerar inte · ${r.objekt_namn || 'trakten'}`, body };
}

export async function byggLarmplatsNejNotis(
  n: { typ: string; payload?: Record<string, unknown> | null; skapad_at?: string | null },
  hamta: HamtaNej,
  nu: number = Date.now(),
): Promise<NejUtfall> {
  const id = n.payload?.kontroll_id;
  if (typeof id !== 'string' || !id) return { typ: 'hoppa_over', orsak: 'Ej skickad — notisen saknar svar' };
  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > NEJ_MAX_ALDER_MS) return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' };
  const { rad, fel } = await hamta(id);
  if (fel) return { typ: 'uppskjut' };
  if (!rad) return { typ: 'hoppa_over', orsak: 'Ej skickad — svaret finns inte längre' };
  const senaste = kontrollFor(rad, rad.alla);
  if (senaste && senaste.id !== rad.id && senaste.svar === 'ja') return { typ: 'hoppa_over', orsak: 'Ej skickad — någon har svarat Ja på larmplatsen efteråt' };
  return { typ: 'skicka', meddelande: { ...nejText(rad), url: `/planering?objekt=${rad.objekt_id}`, tag: `larmplats-nej-${rad.id}` } };
}

export type NejKoRapport = { ok: boolean; svar: number; koade: number; fel?: string };

/** Producenten: Nej-svar de senaste 24 h → en rad till varje aktiv admin utom den som svarade. Ett fel stoppar aldrig resten av kön. */
export async function koaLarmplatsNej(sb: SupabaseClient, nu: Date = new Date()): Promise<NejKoRapport> {
  const tidigast = new Date(nu.getTime() - NEJ_FONSTER_MS).toISOString();
  const k = await sb.from('larmplats_kontroll').select('id, medarbetare_id').eq('svar', 'nej').gte('skapad_at', tidigast).limit(200);
  if (k.error) return { ok: false, svar: 0, koade: 0, fel: `larmplats_kontroll: ${k.error.message}` };
  const svar = (k.data ?? []) as { id: string; medarbetare_id: string }[];
  if (svar.length === 0) return { ok: true, svar: 0, koade: 0 };
  const m = await sb.from('medarbetare').select('id, aktiv').eq('roll', 'admin');
  if (m.error) return { ok: false, svar: svar.length, koade: 0, fel: `medarbetare: ${m.error.message}` };
  const admins = ((m.data ?? []) as { id: string; aktiv: boolean | null }[]).filter((a) => a.aktiv !== false).map((a) => a.id);
  const rader = svar.flatMap((s) => admins.filter((a) => a !== s.medarbetare_id).map((a) => ({
    mottagare_id: a, typ: LARMPLATS_NEJ, payload: { kontroll_id: s.id }, skickas_at: 'infinity', dedup_nyckel: `larmplats:${s.id}`,
  })));
  if (rader.length === 0) return { ok: true, svar: svar.length, koade: 0 };
  const ins = await sb.from('notis_kö').upsert(rader, { onConflict: 'typ,mottagare_id,dedup_nyckel', ignoreDuplicates: true }).select('dedup_nyckel');
  if (ins.error) return { ok: false, svar: svar.length, koade: 0, fel: `notis_kö: ${ins.error.message}` };
  return { ok: true, svar: svar.length, koade: (ins.data ?? []).length };
}
