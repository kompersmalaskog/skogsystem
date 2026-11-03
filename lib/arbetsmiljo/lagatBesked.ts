/**
 * "Det du rapporterade är lagat" (arbetsmiljö, 2026-11-03 — taget från flyget: den som rapporterar ska få veta vad som hände,
 * annars slutar man rapportera).
 *
 * Två saker, en källa:
 *  1. PUSHEN am_lagat: när admin markerat en åtgärd som åtgärdad får DEN SOM RAPPORTERADE en push —
 *       "Lagat · Giant" / "Nödstoppet stannar inte motorn → Bytt brytare · Martin" → /arbetsmiljo?mina=1
 *     Inte till den som själv stängde den, inte för admins egna (kalla 'manuell').
 *  2. LISTAN "Det du rapporterat" på Arbetsmiljö-sidan: varje rapport med sitt läge i ord ("Lagat 3 nov · Bytt brytare" /
 *     "Väntar på att lagas").
 *
 * KÖAS av producenten koaLagatBesked (körs av /api/notis/flush) med skickas_at = 'infinity', som am_anmal: den GAMLA flushen på
 * production skickar okända typer som en generisk "Notis". dedup = åtgärdens id → en gång per åtgärd. Bara åtgärder stängda
 * de senaste 24 timmarna. Ingen migration.
 * Texten byggs FÄRSKT: öppnad igen eller borta → ingenting skickas, läsfel → uppskjuts, köad för mer än 24 h sedan → hoppas över.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { kortaText } from './stoppNotis';
import { fornamn } from './atgarder';
import { datumText } from './introduktion';

export const AM_LAGAT = 'am_lagat';
export const arLagatNotis = (typ: unknown): typ is typeof AM_LAGAT => typ === AM_LAGAT;

/** Åtgärder stängda inom så lång tid tillbaka får en push (äldre stängdes innan pushen fanns). */
export const LAGAT_FONSTER_MS = 24 * 60 * 60 * 1000;
export const LAGAT_MAX_ALDER_MS = 24 * 60 * 60 * 1000;
export const MINA_URL = '/arbetsmiljo?mina=1';

type Kalla = 'svar' | 'forare' | 'manuell' | 'tillbud' | 'skyddsrond';

/** Ett tillbud är inget fel som lagas — det åtgärdas. Allt annat är ett fel på något. */
export const lagatOrd = (kalla: string) => (kalla === 'tillbud' ? 'Åtgärdat' : 'Lagat');

// ---------------------------------------------------------------------------------------------------------------------------
// Pushen
// ---------------------------------------------------------------------------------------------------------------------------

export type LagatRad = {
  id: string;
  status: string;
  kalla: string;
  beskrivning: string;
  vad_gjordes: string | null;
  maskin_namn: string | null;
  stangd_av_namn: string | null;
};

export type HamtaLagat = (atgardId: string) => Promise<{ rad: LagatRad | null; fel?: string }>;

export type LagatUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string }
  | { typ: 'uppskjut' };

export function lagatText(rad: LagatRad): { title: string; body: string } {
  const maskin = rad.maskin_namn?.trim();
  const title = maskin ? `${lagatOrd(rad.kalla)} · ${maskin}` : `${lagatOrd(rad.kalla)} · det du rapporterade`;
  const gjort = rad.vad_gjordes?.trim();
  const vem = fornamn(rad.stangd_av_namn);
  const body = [kortaText(rad.beskrivning, 60), gjort ? `→ ${kortaText(gjort, 60)}` : null].filter(Boolean).join(' ');
  return { title, body: vem ? `${body} · ${vem}` : body };
}

export async function byggLagatNotis(
  n: { typ: string; payload?: Record<string, unknown> | null; skapad_at?: string | null },
  hamta: HamtaLagat,
  nu: number = Date.now(),
): Promise<LagatUtfall> {
  const id = n.payload?.atgard_id;
  if (typeof id !== 'string' || !id) return { typ: 'hoppa_over', orsak: 'Ej skickad — notisen saknar åtgärd' };
  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > LAGAT_MAX_ALDER_MS) return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' };

  const { rad, fel } = await hamta(id);
  if (fel) return { typ: 'uppskjut' };
  if (!rad) return { typ: 'hoppa_over', orsak: 'Ej skickad — åtgärden finns inte längre' };
  if (rad.status === 'oppen') return { typ: 'hoppa_over', orsak: 'Ej skickad — åtgärden är öppen igen' };

  return { typ: 'skicka', meddelande: { ...lagatText(rad), url: MINA_URL, tag: `am-lagat-${rad.id}` } };
}

/** Vem som rapporterade: den som skrev rapporten, annars föraren vars maskinkoll gav Nej. */
export function rapportor(rad: { rapporterad_av?: string | null; svar?: unknown }): string | null {
  if (rad.rapporterad_av) return rad.rapporterad_av;
  const svar = Array.isArray(rad.svar) ? rad.svar[0] : rad.svar as any;
  const koll = svar ? (Array.isArray(svar.koll) ? svar.koll[0] : svar.koll) : null;
  return koll?.medarbetare_id ?? null;
}

export type LagatKoRapport = { ok: boolean; stangda: number; koade: number; fel?: string };

/** Producenten: åtgärder stängda de senaste 24 h → en rad till den som rapporterade (utom när den själv stängde). Ett fel stoppar aldrig resten av kön. */
export async function koaLagatBesked(sb: SupabaseClient, nu: Date = new Date()): Promise<LagatKoRapport> {
  const tidigast = new Date(nu.getTime() - LAGAT_FONSTER_MS).toISOString();
  const a = await sb.from('am_atgard')
    .select('id, kalla, rapporterad_av, stangd_av, svar:svar_id(koll:maskinkoll_id(medarbetare_id))')
    .neq('status', 'oppen').neq('kalla', 'manuell').gte('stangd_tid', tidigast).limit(200);
  if (a.error) return { ok: false, stangda: 0, koade: 0, fel: `am_atgard: ${a.error.message}` };
  const stangda = (a.data ?? []) as any[];

  const rader = stangda.flatMap(r => {
    const vem = rapportor(r);
    if (!vem || vem === r.stangd_av) return [];
    return [{ mottagare_id: vem, typ: AM_LAGAT, payload: { atgard_id: r.id }, skickas_at: 'infinity', dedup_nyckel: `lagat:${r.id}` }];
  });
  if (rader.length === 0) return { ok: true, stangda: stangda.length, koade: 0 };

  const ins = await sb.from('notis_kö').upsert(rader, { onConflict: 'typ,mottagare_id,dedup_nyckel', ignoreDuplicates: true }).select('dedup_nyckel');
  if (ins.error) return { ok: false, stangda: stangda.length, koade: 0, fel: `notis_kö: ${ins.error.message}` };
  return { ok: true, stangda: stangda.length, koade: (ins.data ?? []).length };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Listan "Det du rapporterat"
// ---------------------------------------------------------------------------------------------------------------------------

export type MinRapport = {
  id: string;
  kalla: Kalla;
  maskinNamn: string | null;
  beskrivning: string;
  lagad: boolean;
  vadGjordes: string | null;
  stangdTid: string | null;
  skapad: string;
};

/** Raden: vad det gällde, på en rad. "Giant · Nödstoppet stannar inte motorn". */
export function rapportTitel(r: MinRapport): string {
  const vad = kortaText(r.beskrivning, 70);
  return r.maskinNamn ? `${r.maskinNamn} · ${vad}` : vad;
}

/** Läget i ord. "Lagat 3 nov · Bytt brytare" / "Väntar på att lagas · rapporterad 31 okt". */
export function rapportUnder(r: MinRapport): string {
  if (r.lagad) {
    const nar = r.stangdTid ? ` ${datumText(r.stangdTid)}` : '';
    const gjort = r.vadGjordes?.trim();
    return gjort ? `${lagatOrd(r.kalla)}${nar} · ${kortaText(gjort, 60)}` : `${lagatOrd(r.kalla)}${nar}`;
  }
  return `${r.kalla === 'tillbud' ? 'Väntar på åtgärd' : 'Väntar på att lagas'} · rapporterad ${datumText(r.skapad)}`;
}

/** Raden på Arbetsmiljö-sidan. "1 lagat · 2 väntar". */
export function minaSammanfattning(lista: readonly MinRapport[]): string {
  const lagade = lista.filter(r => r.lagad).length;
  const vantar = lista.length - lagade;
  const delar: string[] = [];
  if (vantar > 0) delar.push(`${vantar} väntar`);
  if (lagade > 0) delar.push(`${lagade} ${lagade === 1 ? 'klar' : 'klara'}`);
  return delar.join(' · ');
}

/** De som väntar först (äldst först — de har väntat längst), sedan de klara (senast klar först). */
export function ordnaMina(lista: readonly MinRapport[]): MinRapport[] {
  const vantar = lista.filter(r => !r.lagad).sort((a, b) => a.skapad.localeCompare(b.skapad));
  const klara = lista.filter(r => r.lagad).sort((a, b) => (b.stangdTid ?? b.skapad).localeCompare(a.stangdTid ?? a.skapad));
  return [...vantar, ...klara];
}

/** Bara det senaste halvåret — en gammal lagad sak är ingen nyhet. */
export const MINA_FONSTER_DAGAR = 183;

/**
 * Den inloggades egna rapporter. RLS släpper redan in föraren på sina egna (rapporterad_av, eller via sin maskinkoll), men admin ser allt —
 * därför filtreras på personen i båda frågorna. Läsfel = null, aldrig en tom lista.
 */
export async function hamtaMinaRapporter(sb: SupabaseClient, medarbetareId: string, nu: Date = new Date()): Promise<MinRapport[] | null> {
  const tidigast = new Date(nu.getTime() - MINA_FONSTER_DAGAR * 86_400_000).toISOString();
  const falt = 'id, kalla, maskin_id, beskrivning, status, vad_gjordes, stangd_tid, skapad';
  const [egna, koll] = await Promise.all([
    sb.from('am_atgard').select(falt).eq('rapporterad_av', medarbetareId).neq('kalla', 'manuell').gte('skapad', tidigast).limit(100),
    sb.from('am_atgard').select(`${falt}, svar:svar_id!inner(koll:maskinkoll_id!inner(medarbetare_id))`)
      .is('rapporterad_av', null).eq('svar.koll.medarbetare_id', medarbetareId).gte('skapad', tidigast).limit(100),
  ]);
  if (egna.error || koll.error) return null;
  const rader = new Map<string, any>();
  for (const r of [...(egna.data ?? []), ...(koll.data ?? [])] as any[]) rader.set(r.id, r);

  const maskinIds = Array.from(new Set(Array.from(rader.values()).map(r => r.maskin_id).filter(Boolean)));
  const namn = new Map<string, string>();
  if (maskinIds.length) {
    const m = await sb.from('dim_maskin').select('maskin_id, visningsnamn, modell').in('maskin_id', maskinIds);
    if (!m.error) for (const x of (m.data ?? []) as any[]) namn.set(x.maskin_id, x.visningsnamn || x.modell || x.maskin_id);
  }
  return Array.from(rader.values()).map(r => ({
    id: r.id,
    kalla: r.kalla,
    maskinNamn: r.maskin_id ? namn.get(r.maskin_id) ?? null : null,
    beskrivning: r.beskrivning ?? '',
    lagad: r.status !== 'oppen',
    vadGjordes: r.vad_gjordes ?? null,
    stangdTid: r.stangd_tid ?? null,
    skapad: r.skapad,
  }));
}
