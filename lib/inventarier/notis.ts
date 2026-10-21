/**
 * Notisen "Börjar ta slut" — en förbrukningsrad har gått under sin minnivå.
 *
 *   inventarie_under_min → admin (Martin, Joacim): "Sågkedja 3/8 .404: 5 kvar i Maskinhallen (min 6)"  → /inventarier?rad=<id>
 *
 * KÖAS av triggern kö_inventarie_notis på inventarie_rad (migration 20261021134419_inventarier_notis_under_min.sql), EN gång per
 * korsning under min, med skickas_at = 'infinity' — som ledighet och lass: den GAMLA flushen på production skickar okända typer som en
 * generisk "Notis" + rå JSON. Den nya flushen tar typen oavsett skickas_at (`flushUrval`).
 *
 * Texten byggs FÄRSKT vid utskick ur raden som den ser ut just då. Är raden borta, beställd eller påfylld igen skickas ingenting
 * (notisen är inte längre sann). Läsfel → uppskjuts (inte "finns inte"). Köad för mer än 24 timmar sedan → hoppas över, så en hög
 * som väntat på release aldrig skickas på en gång.
 *
 * Ren modul (ingen Supabase-import): raden hämtas av anroparen, så reglerna kan testas utan nätverk.
 */

import { antalText, artikelTitel } from './vy';

export const INVENTARIE_UNDER_MIN = 'inventarie_under_min';
export const arInventarieNotis = (typ: unknown): typ is typeof INVENTARIE_UNDER_MIN => typ === INVENTARIE_UNDER_MIN;

export const INVENTARIE_MAX_ALDER_MS = 24 * 60 * 60 * 1000;

export type InventarieNotisRad = {
  id: string;
  antal: number | null;
  min_antal: number | null;
  bestalld_tid: string | null;
  artikel_namn: string;
  sitter_pa: string | null;
  enhet: string | null;
  plats_namn: string;
};

/** `rad: null` = raden finns inte. `fel` = läsningen misslyckades (inte samma sak som "finns inte"). */
export type HamtaInventarie = (radId: string) => Promise<{ rad: InventarieNotisRad | null; fel?: string }>;

export type InventarieNotisUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string }
  | { typ: 'uppskjut' };

/** "Sågkedja 3/8 .404: 5 kvar i Maskinhallen (min 6)". */
export function inventarieNotisText(rad: InventarieNotisRad): string {
  const titel = artikelTitel({ namn: rad.artikel_namn, sitter_pa: rad.sitter_pa });
  return `${titel}: ${antalText(rad.antal ?? 0, rad.enhet)} kvar i ${rad.plats_namn} (min ${rad.min_antal ?? 0})`;
}

export async function byggInventarieNotis(
  n: { typ: string; payload?: Record<string, unknown> | null; skapad_at?: string | null },
  hamta: HamtaInventarie,
  nu: number = Date.now(),
): Promise<InventarieNotisUtfall> {
  const radId = n.payload?.rad_id;
  if (typeof radId !== 'string' || !radId) return { typ: 'hoppa_over', orsak: 'Ej skickad — notisen saknar rad' };

  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > INVENTARIE_MAX_ALDER_MS) {
    return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' };
  }

  const { rad, fel } = await hamta(radId);
  if (fel) return { typ: 'uppskjut' };
  if (!rad) return { typ: 'hoppa_over', orsak: 'Ej skickad — raden finns inte längre' };
  if (rad.bestalld_tid) return { typ: 'hoppa_over', orsak: 'Ej skickad — redan beställd' };
  if (rad.antal == null || rad.min_antal == null || rad.antal >= rad.min_antal) {
    return { typ: 'hoppa_over', orsak: 'Ej skickad — inte längre under minnivån' };
  }

  return {
    typ: 'skicka',
    meddelande: {
      title: 'Börjar ta slut',
      body: inventarieNotisText(rad),
      url: `/inventarier?rad=${encodeURIComponent(rad.id)}`,
      tag: `inventarie-${rad.id}`,
    },
  };
}
