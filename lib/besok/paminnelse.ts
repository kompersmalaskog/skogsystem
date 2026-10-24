// Påminnelsen till planeraren: "<Trakt> startar i morgon/i dag – skicka till markägaren?"
//
//   • dagen före planerad start (objekt.planerad_start = i morgon), eller
//   • när första maskinen startar (objekt.pagaende_startad_timestamp = i dag) om ingen planerad start finns.
//   Ingen påminnelse om SMS:et redan är BEKRÄFTAT skickat (objekt_besok_sms.handelse = 'skickad' – att knappen öppnades räknas inte) och ingen för ett avslutat objekt. Köas av flush (cron var 5:e min), EN gång per objekt och tillfälle (dedup_nyckel).
//   Texten byggs FÄRSKT vid utskick: har SMS:et hunnit öppnas, eller objektet avslutats, skickas ingenting.
//
// Ren modul (ingen Supabase-import): raderna hämtas av anroparen.

import { dagarMellan, idagStockholm } from '@/lib/grotvy/format';

export const BESOK_PAMINNELSE = 'besok_paminnelse';
export const arBesokPaminnelse = (typ: unknown): typ is typeof BESOK_PAMINNELSE => typ === BESOK_PAMINNELSE;

export const PAMINNELSE_MAX_ALDER_MS = 24 * 60 * 60 * 1000;

export type PaminnelseObjekt = {
  id: string;
  namn: string;
  status: string | null;
  planerad_start: string | null;
  pagaende_startad_timestamp: string | null;
};

export type PaminnelseKandidat = { objektId: string; namn: string; nar: 'i morgon' | 'i dag'; nyckel: string };

/** Vilka objekt som ska påminnas idag. `harSms` = objekt-id där SMS:et redan öppnats. */
export function valjPaminnelser(objekt: PaminnelseObjekt[], harSms: Set<string>, nu: Date = new Date()): PaminnelseKandidat[] {
  const idag = idagStockholm(nu);
  const ut: PaminnelseKandidat[] = [];
  for (const o of objekt) {
    if (harSms.has(o.id)) continue;
    if (o.status === 'avslutat' || o.status === 'klar') continue;
    if (o.planerad_start && /^\d{4}-\d{2}-\d{2}$/.test(o.planerad_start)) {
      if (dagarMellan(idag, o.planerad_start) === 1) ut.push({ objektId: o.id, namn: o.namn, nar: 'i morgon', nyckel: `besok:${o.id}:plan:${o.planerad_start}` });
      continue;   // planerad start finns → bara den räknas, aldrig "första maskinen startar"
    }
    if (o.pagaende_startad_timestamp && idagStockholm(new Date(o.pagaende_startad_timestamp)) === idag) {
      ut.push({ objektId: o.id, namn: o.namn, nar: 'i dag', nyckel: `besok:${o.id}:start:${idag}` });
    }
  }
  return ut;
}

export type BesokNotisRad = { id: string; namn: string; status: string | null; sms_skickat: boolean };
export type HamtaBesokObjekt = (objektId: string) => Promise<{ rad: BesokNotisRad | null; fel?: string }>;
export type BesokNotisUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string }
  | { typ: 'uppskjut' };

/** Adressen som en tryckt notis öppnar: planeringsvyn på objektet med ⓘ öppet och SMS-raden i fokus. */
export const besokNotisUrl = (objektId: string) => `/planering?objekt=${encodeURIComponent(objektId)}&besok=sms`;

export async function byggBesokNotis(
  n: { typ: string; payload?: Record<string, unknown> | null; skapad_at?: string | null },
  hamta: HamtaBesokObjekt,
  nu: number = Date.now(),
): Promise<BesokNotisUtfall> {
  const objektId = n.payload?.objekt_id;
  const nar = n.payload?.nar === 'i dag' ? 'i dag' : 'i morgon';
  if (typeof objektId !== 'string' || !objektId) return { typ: 'hoppa_over', orsak: 'Ej skickad — notisen saknar objekt' };
  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > PAMINNELSE_MAX_ALDER_MS) return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' };
  const { rad, fel } = await hamta(objektId);
  if (fel) return { typ: 'uppskjut' };
  if (!rad) return { typ: 'hoppa_over', orsak: 'Ej skickad — objektet finns inte längre' };
  if (rad.status === 'avslutat' || rad.status === 'klar') return { typ: 'hoppa_over', orsak: 'Ej skickad — objektet är avslutat' };
  if (rad.sms_skickat) return { typ: 'hoppa_over', orsak: 'Ej skickad — SMS till markägaren är redan bekräftat skickat' };
  return {
    typ: 'skicka',
    meddelande: { title: `${rad.namn} startar ${nar}`, body: 'Skicka till markägaren?', url: besokNotisUrl(rad.id), tag: `besok-${rad.id}` },
  };
}
