/**
 * Notisen "Månadens stickprov" — databasen har dragit månadens objekt (egenkontroll_stickprov) och Martin ska få veta utan att öppna appen.
 *
 *   egenkontroll_stickprov → Martin: "Månadens stickprov: 3 objekt, 14,8 km isär"  → /egenkontroll
 *
 * KÖAS av den transaktion som skapar månadens rad (RPC egenkontroll_stickprov, migration …_4_publik), en gång per mottagare och månad, med
 * skickas_at = 'infinity' — som ledighets- och lassnotiserna: den GAMLA flushen på production skickar okända typer som en generisk "Notis" + rå JSON,
 * så raden får inte kunna tas av den. Den nya flushen tar typen oavsett skickas_at (`flushUrval`) och styr tiden själv:
 *   payload.skicka_efter = 07:00 svensk tid samma dag, eller nu om dragningen skedde senare. Före den tiden SKJUTS notisen UPP (raden lämnas
 *   oskickad, nästa cron försöker igen) — cronen drar strax efter midnatt och en push 00:05 är fel.
 *
 * Texten byggs FÄRSKT vid utskick ur månadens rad. Raden finns inte kvar → hoppas över. Läsfel → uppskjuts (inte "finns inte"). Köad för mer än
 * 24 timmar sedan → hoppas över, så en hög som väntat på release aldrig skickas på en gång. "km isär" är fågelväg (samma tal som vyn visar).
 *
 * Ren modul (ingen Supabase-import): raden hämtas av anroparen, så skip-reglerna kan testas utan nätverk.
 */

import { kmText } from '@/lib/objektVal';
import type { Stickprov } from '@/lib/egenkontrollStickprov';

export const EGENKONTROLL_STICKPROV = 'egenkontroll_stickprov';
export const arStickprovNotis = (typ: unknown): typ is typeof EGENKONTROLL_STICKPROV => typ === EGENKONTROLL_STICKPROV;

export const STICKPROV_MAX_ALDER_MS = 24 * 60 * 60 * 1000;

export type StickprovNotisRad = Pick<Stickprov, 'manad' | 'valda' | 'spridning_km'>;

/** `rad: null` = månadens rad finns inte. `fel` = läsningen misslyckades (inte samma sak som "finns inte"). */
export type HamtaStickprov = (manad: string) => Promise<{ rad: StickprovNotisRad | null; fel?: string }>;

export type StickprovNotisUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string }
  | { typ: 'uppskjut' };

/** "Månadens stickprov: 3 objekt, 14,8 km isär". Ett objekt har inget "isär". */
export function stickprovNotisText(rad: Pick<StickprovNotisRad, 'valda' | 'spridning_km'>): string {
  const n = rad.valda.length;
  const delar = [`${n} objekt`];
  if (n > 1 && rad.spridning_km != null) delar.push(`${kmText(rad.spridning_km)} isär`);
  return `Månadens stickprov: ${delar.join(', ')}`;
}

export async function byggStickprovNotis(
  n: { typ: string; payload?: Record<string, unknown> | null; skapad_at?: string | null },
  hamta: HamtaStickprov,
  nu: number = Date.now(),
): Promise<StickprovNotisUtfall> {
  const manad = n.payload?.manad;
  if (typeof manad !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(manad)) return { typ: 'hoppa_over', orsak: 'Ej skickad — notisen saknar månad' };

  // För gammal? Kollas FÖRE allt annat: en gammal rad ska aldrig skjutas upp (och aldrig skickas).
  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > STICKPROV_MAX_ALDER_MS) {
    return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' };
  }

  // Inte före den bestämda tiden (07:00 svensk tid). Saknas tiden skickas den direkt.
  const efter = typeof n.payload?.skicka_efter === 'string' ? Date.parse(n.payload.skicka_efter) : NaN;
  if (Number.isFinite(efter) && nu < efter) return { typ: 'uppskjut' };

  const { rad, fel } = await hamta(manad);
  if (fel) return { typ: 'uppskjut' };
  if (!rad) return { typ: 'hoppa_over', orsak: 'Ej skickad — månadens stickprov finns inte kvar' };
  if (rad.valda.length === 0) return { typ: 'hoppa_over', orsak: 'Ej skickad — inga objekt i månadens stickprov' };

  return {
    typ: 'skicka',
    meddelande: {
      title: 'Egenkontroll',
      body: stickprovNotisText(rad),
      url: '/egenkontroll',
      tag: `egenkontroll-stickprov-${manad}`,
    },
  };
}
