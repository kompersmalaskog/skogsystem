/**
 * Ledighetens två pushnotiser — texten byggs FÄRSKT vid utskick (som dagsslut-notisen), ur ansökan som den ser ut
 * just då. Triggern (migration 20261014072825) köar bara VEM och VILKEN ansökan.
 *
 *  ledighet_ansokan  → godkännare (admin) utom den som ansökte: "{Förnamn} har ansökt om ledighet {period}"  → /ledighet?godkann=<id>
 *  ledighet_beslut   → ägaren:                                  "Din ledighet {period} är godkänd | nekad"  → /ledighet?besked=<id>
 *
 * Ren modul (ingen Supabase-import): raden hämtas av anroparen via `hamtaRad`, så skip-reglerna kan testas
 * utan nätverk. Ingen beslutskommentar — beslutet har ingen egen (fältet `kommentar` är den anställdes text).
 */
import { fmtPeriod } from '@/app/ledighet/_components/datum';

export const LEDIGHET_ANSOKAN = 'ledighet_ansokan';
export const LEDIGHET_BESLUT = 'ledighet_beslut';

export function arLedighetNotis(typ: unknown): typ is typeof LEDIGHET_ANSOKAN | typeof LEDIGHET_BESLUT {
  return typ === LEDIGHET_ANSOKAN || typ === LEDIGHET_BESLUT;
}

/**
 * Ledighetsraderna köas med skickas_at = 'infinity' (migrationen): den GAMLA flush-koden på production-deployen
 * väljer dem då aldrig (hade den gjort det skulle den skicka en generisk "Notis" + rå JSON — okända typer faller
 * på `byggMeddelande`s fallback). Den nya flushen tar dem oavsett skickas_at, och hoppar över allt som köats för
 * mer än så här länge sedan, så en hög som väntat på release aldrig skickas på en gång.
 */
export const LEDIGHET_MAX_ALDER_MS = 24 * 60 * 60 * 1000;

/** PostgREST `.or()`-uttrycket för flushens urval: förfallna rader ELLER ledighetsrader (som har skickas_at 'infinity'). */
export const flushUrval = (nuIso: string) =>
  `skickas_at.lte.${nuIso},typ.in.(${LEDIGHET_ANSOKAN},${LEDIGHET_BESLUT})`;

export type LedighetNotisRad = {
  id: string;
  status: string;
  startdatum: string;
  slutdatum: string;
  /** Sökandens namn (medarbetare.namn). Saknas det säger texten "En medarbetare" — hellre det än ett gissat namn. */
  namn: string | null;
};

/** `rad: null` = ansökan finns inte (borttagen). `fel` = läsningen misslyckades (inte samma sak som "finns inte"). */
export type HamtaRad = (ansokanId: string) => Promise<{ rad: LedighetNotisRad | null; fel?: string }>;

export type LedighetNotisUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  /** Skicka inte och köa inte om: notisen är inte längre sann. `orsak` blir fel_meddelande (samma sätt som dagsslut). */
  | { typ: 'hoppa_over'; orsak: string }
  /** Läsningen felade — lämna raden OSKICKAD så nästa cron försöker igen. Ett läsfel är inte "ansökan finns inte". */
  | { typ: 'uppskjut' };

export function fornamn(namn: string | null | undefined): string {
  const f = (namn ?? '').trim().split(/\s+/)[0];
  return f || 'En medarbetare';
}

export async function byggLedighetNotis(
  n: { typ: string; payload?: Record<string, unknown> | null; skapad_at?: string | null },
  hamtaRad: HamtaRad,
  nu: number = Date.now(),
): Promise<LedighetNotisUtfall> {
  const id = n.payload?.ansokan_id;
  if (typeof id !== 'string' || !id) return { typ: 'hoppa_over', orsak: 'Ej skickad — notisen saknar ansokan_id' };

  // För gammal? Kollas FÖRE läsningen: en gammal rad ska aldrig skjutas upp av ett läsfel (och aldrig skickas).
  // Okänd/ogiltig tid räknas inte som gammal — texten byggs ändå ur ansökan som den ser ut nu.
  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > LEDIGHET_MAX_ALDER_MS) {
    return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' };
  }

  const { rad, fel } = await hamtaRad(id);
  if (fel) return { typ: 'uppskjut' };
  if (!rad) return { typ: 'hoppa_over', orsak: 'Ej skickad — ansökan finns inte kvar' };

  const period = fmtPeriod(rad.startdatum, rad.slutdatum);

  if (n.typ === LEDIGHET_ANSOKAN) {
    // Redan hanterad (eller borttagen) innan utskicket → ingen "att godkänna" som inte stämmer längre.
    if (rad.status !== 'väntar') return { typ: 'hoppa_over', orsak: 'Ej skickad — ansökan var redan hanterad' };
    return {
      typ: 'skicka',
      meddelande: {
        title: 'Ledighet',
        body: `${fornamn(rad.namn)} har ansökt om ledighet ${period}`,
        // Id:t i länken gör att vyn landar PÅ ansökan (öppnar godkänn-listan och markerar raden), inte bara på sidan.
        url: `/ledighet?godkann=${encodeURIComponent(rad.id)}`,
        tag: `ledighet-ansokan-${rad.id}`,
      },
    };
  }

  // Beslut: texten följer ansökans status NU. Är den inte godkänd/nekad längre (omkastad till väntar) är beskedet inte sant.
  if (rad.status !== 'godkänd' && rad.status !== 'nekad') {
    return { typ: 'hoppa_over', orsak: 'Ej skickad — beslutet gäller inte längre' };
  }
  return {
    typ: 'skicka',
    meddelande: {
      title: 'Ledighet',
      body: `Din ledighet ${period} är ${rad.status}`,
      // Id:t gör att vyn visar just det här beskedet överst, scrollar dit och markerar det en stund.
      url: `/ledighet?besked=${encodeURIComponent(rad.id)}`,
      tag: `ledighet-beslut-${rad.id}`,
    },
  };
}
