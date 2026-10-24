// Planerarens sida av besöksflödet: raderna i loggen ("Besök") och SMS-raden. Rena funktioner — hooken läser, komponenten ritar.

import { loggTid, klockslag } from './tid';
import { forstaNamn } from '@/app/oversikt-v2/sms';

export type BesokRad = { id: string; namn: string; telefon: string; besokstid: string; skapad_at: string };
export type KvittensRad = { besok_id: string; maskin_id: string; roll: string | null; forare_id: string | null; kvitterad_at: string; testlage: boolean };
/** Loggen är en händelselogg: knappen som öppnar/kopierar är INTE detsamma som skickat. Bara 'skickad' (planerarens eget "Ja, skickat") räknas som skickat. */
export type SmsHandelse = 'oppnad' | 'kopierad' | 'skickad' | 'ej_skickad';
export type SmsRad = { id: string; oppnad_av: string | null; oppnad_at: string; mottagare_namn: string | null; mottagare_nummer: string | null; handelse: SmsHandelse };

export type LoggRad = {
  id: string;
  rubrik: string;
  /** "Anmäld 22 okt 13:10 · kommer 14:30" */
  under: string;
  telefon: string;
  /** en rad per maskin som tryckt Uppfattat: "Giant · Stefan · 13:52" (+ " · test" för en admin som provat i testläget) */
  kvittenser: string[];
  vantar: boolean;
};

type Namnuppslag = { maskin: (id: string) => string; person: (id: string | null) => string | null };

/** Besöken, nyast först, med vilka maskiner som sett dem. Ett besök utan kvittens står som "ingen maskin har kvitterat än" (vantar). */
export function loggRader(besok: BesokRad[], kvitt: KvittensRad[], namn: Namnuppslag, nu: Date = new Date()): LoggRad[] {
  return [...besok]
    .sort((a, b) => Date.parse(b.skapad_at) - Date.parse(a.skapad_at))
    .map((b) => {
      const k = kvitt.filter((x) => x.besok_id === b.id).sort((x, y) => Date.parse(x.kvitterad_at) - Date.parse(y.kvitterad_at));
      return {
        id: b.id,
        rubrik: b.namn,
        under: `Anmäld ${loggTid(b.skapad_at, nu)} · kommer ${loggTid(b.besokstid, nu)}`,
        telefon: b.telefon,
        kvittenser: k.map((x) => [namn.maskin(x.maskin_id), namn.person(x.forare_id), klockslag(x.kvitterad_at), x.testlage ? 'test' : null].filter(Boolean).join(' · ')),
        vantar: k.length === 0,
      };
    });
}

export type SmsLage = { typ: 'ingen' | 'obekraftad' | 'skickad' | 'ej_skickad'; text: string | null };

/**
 * Läget för SMS:et till markägaren, ur den SENASTE händelsen:
 *   ingen        – inget har gjorts
 *   obekraftad   – SMS-appen öppnades / texten kopierades men ingen har sagt att det skickades → kortet frågar "Skickade du SMS:et?", påminnelsen tystnar INTE
 *   skickad      – planeraren har bekräftat att det skickades → påminnelsen tystnar
 *   ej_skickad   – planeraren har svarat nej
 */
export function smsLage(sms: SmsRad[], person: (id: string | null) => string | null, nu: Date = new Date()): SmsLage {
  const senaste = [...sms].sort((a, b) => Date.parse(b.oppnad_at) - Date.parse(a.oppnad_at))[0];
  if (!senaste) return { typ: 'ingen', text: null };
  const av = forstaNamn(person(senaste.oppnad_av));
  const nar = `${loggTid(senaste.oppnad_at, nu)}${av ? ` av ${av}` : ''}`;
  switch (senaste.handelse) {
    case 'skickad': return { typ: 'skickad', text: `Skickat ${nar}` };
    case 'ej_skickad': return { typ: 'ej_skickad', text: `Inte skickat (${nar})` };
    case 'kopierad': return { typ: 'obekraftad', text: `Kopierat ${nar} – inte bekräftat skickat` };
    default: return { typ: 'obekraftad', text: `Öppnat ${nar} – inte bekräftat skickat` };
  }
}

/** Raden under "Skicka till markägaren". null = inget har gjorts. */
export const smsStatusText = (sms: SmsRad[], person: (id: string | null) => string | null, nu: Date = new Date()): string | null => smsLage(sms, person, nu).text;
