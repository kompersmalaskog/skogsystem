/**
 * Ledighetens två pushnotiser — texten byggs FÄRSKT vid utskick (som dagsslut-notisen), ur ansökan som den ser ut
 * just då. Triggern (migration 20261014100000) köar bara VEM och VILKEN ansökan.
 *
 *  ledighet_ansokan  → godkännare (admin) utom den som ansökte: "{Förnamn} har ansökt om ledighet {period}"
 *  ledighet_beslut   → ägaren:                                  "Din ledighet {period} är godkänd | nekad"
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
  n: { typ: string; payload?: Record<string, unknown> | null },
  hamtaRad: HamtaRad,
): Promise<LedighetNotisUtfall> {
  const id = n.payload?.ansokan_id;
  if (typeof id !== 'string' || !id) return { typ: 'hoppa_over', orsak: 'Ej skickad — notisen saknar ansokan_id' };

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
        url: '/ledighet?godkann=1',
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
      url: '/ledighet',
      tag: `ledighet-beslut-${rad.id}`,
    },
  };
}
