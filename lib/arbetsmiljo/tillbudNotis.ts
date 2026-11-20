/**
 * Pushen när en förare rapporterat vad som hände (tillbud eller olycka).
 *
 *   am_tillbud → admin och skyddsombud (utom den som rapporterade): "Olycka · Giant" / "Trädet föll åt fel håll · Stefan"
 *   → /atgarder?id=<åtgärd>
 *
 * KÖAS av triggern kö_am_tillbud på am_atgard (migration *_arbetsmiljo_tillbud.sql) med skickas_at = 'infinity', som am_stopp:
 * den GAMLA flushen på production skickar okända typer som en generisk "Notis"; den nya tar typen oavsett skickas_at.
 *
 * Texten byggs FÄRSKT ur åtgärden. Borta eller redan åtgärdad → ingenting skickas. Läsfel → uppskjuts. Köad för mer än
 * 24 timmar sedan → hoppas över. Ren modul: raden hämtas av anroparen.
 */

import { kortaText } from './stoppNotis';

export const AM_TILLBUD = 'am_tillbud';
export const arTillbudNotis = (typ: unknown): typ is typeof AM_TILLBUD => typ === AM_TILLBUD;

export const TILLBUD_MAX_ALDER_MS = 24 * 60 * 60 * 1000;

export type TillbudNotisRad = {
  id: string;
  status: string;
  typ: 'tillbud' | 'olycka' | null;
  beskrivning: string;
  maskin_namn: string | null;
  rapportor_namn: string | null;
};

export type HamtaTillbud = (atgardId: string) => Promise<{ rad: TillbudNotisRad | null; fel?: string }>;

export type TillbudNotisUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string }
  | { typ: 'uppskjut' };

export function tillbudNotisText(rad: TillbudNotisRad): { title: string; body: string } {
  const vad = rad.typ === 'olycka' ? 'Olycka' : 'Tillbud';
  const maskin = rad.maskin_namn?.trim();
  const vem = rad.rapportor_namn?.trim().split(/\s+/)[0];
  return { title: maskin ? `${vad} · ${maskin}` : vad, body: [kortaText(rad.beskrivning), vem].filter(Boolean).join(' · ') };
}

export async function byggTillbudNotis(
  n: { typ: string; payload?: Record<string, unknown> | null; skapad_at?: string | null },
  hamta: HamtaTillbud,
  nu: number = Date.now(),
): Promise<TillbudNotisUtfall> {
  const id = n.payload?.atgard_id;
  if (typeof id !== 'string' || !id) return { typ: 'hoppa_over', orsak: 'Ej skickad — notisen saknar åtgärd' };

  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > TILLBUD_MAX_ALDER_MS) {
    return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' };
  }

  const { rad, fel } = await hamta(id);
  if (fel) return { typ: 'uppskjut' };
  if (!rad) return { typ: 'hoppa_over', orsak: 'Ej skickad — rapporten finns inte längre' };
  if (rad.status !== 'oppen') return { typ: 'hoppa_over', orsak: 'Ej skickad — redan åtgärdad' };

  return {
    typ: 'skicka',
    meddelande: { ...tillbudNotisText(rad), url: `/atgarder?id=${encodeURIComponent(rad.id)}`, tag: `am-tillbud-${rad.id}` },
  };
}
