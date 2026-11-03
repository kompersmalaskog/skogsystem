/**
 * Pushen när någon lagt till en produkt utan säkerhetsblad.
 *
 *   am_kemikalie → aktiva admin (utom den som lade till): "Säkerhetsblad saknas · Biohyd 46" / "Stefan la till den · Giant. Be säljaren om bladet."
 *   → /kemikalier?id=<produkt>
 *
 * KÖAS av triggern kö_am_kemikalie på am_kemikalie (migration *_am_kemikalier_alla_lagger_till.sql) med skickas_at = 'infinity',
 * som de andra arbetsmiljönotiserna: den GAMLA flushen på production skickar okända typer som en generisk "Notis".
 *
 * Texten byggs FÄRSKT. Borta, inte längre aktiv eller bladet redan uppladdat → ingenting skickas. Läsfel → uppskjuts.
 * Köad för mer än 24 timmar sedan → hoppas över. Ren modul: raden hämtas av anroparen.
 */

import { kortaText } from './stoppNotis';

export const AM_KEMIKALIE = 'am_kemikalie';
export const arKemikalieNotis = (typ: unknown): typ is typeof AM_KEMIKALIE => typ === AM_KEMIKALIE;

export const KEMIKALIE_MAX_ALDER_MS = 24 * 60 * 60 * 1000;

export type KemikalieNotisRad = {
  id: string;
  namn: string;
  var_finns: string | null;
  aktiv: boolean;
  har_blad: boolean;
  tillagd_av_namn: string | null;
};

export type HamtaKemikalie = (id: string) => Promise<{ rad: KemikalieNotisRad | null; fel?: string }>;

export type KemikalieNotisUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string }
  | { typ: 'uppskjut' };

export function kemikalieNotisText(rad: KemikalieNotisRad): { title: string; body: string } {
  const vem = rad.tillagd_av_namn?.trim().split(/\s+/)[0];
  const var_ = rad.var_finns?.trim();
  const forst = [vem ? `${vem} la till den` : 'Tillagd i appen', var_].filter(Boolean).join(' · ');
  return { title: `Säkerhetsblad saknas · ${kortaText(rad.namn)}`, body: `${forst}. Be säljaren om bladet.` };
}

export async function byggKemikalieNotis(
  n: { typ: string; payload?: Record<string, unknown> | null; skapad_at?: string | null },
  hamta: HamtaKemikalie,
  nu: number = Date.now(),
): Promise<KemikalieNotisUtfall> {
  const id = n.payload?.kemikalie_id;
  if (typeof id !== 'string' || !id) return { typ: 'hoppa_over', orsak: 'Ej skickad — notisen saknar produkt' };

  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > KEMIKALIE_MAX_ALDER_MS) {
    return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' };
  }

  const { rad, fel } = await hamta(id);
  if (fel) return { typ: 'uppskjut' };
  if (!rad || !rad.aktiv) return { typ: 'hoppa_over', orsak: 'Ej skickad — produkten finns inte längre' };
  if (rad.har_blad) return { typ: 'hoppa_over', orsak: 'Ej skickad — säkerhetsbladet finns redan' };

  return {
    typ: 'skicka',
    meddelande: { ...kemikalieNotisText(rad), url: `/kemikalier?id=${encodeURIComponent(rad.id)}`, tag: `am-kemikalie-${rad.id}` },
  };
}
