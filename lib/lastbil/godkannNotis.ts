/**
 * Påminnelsen "3 flyttar väntar på godkännande" (Martin 2026-10-24: "kör på det men bara om man inte godkänt den då").
 *
 * En flytt hamnar inte på fakturan förrän den är godkänd, och appen sa det bara när man själv öppnade Lastbilen. Nu köas EN
 * push per admin varje MÅNDAG från 07:00 svensk tid — bara när något väntar. Texten byggs FÄRSKT vid utskick ur hur det ser ut
 * då: är allt godkänt när pushen ska gå skickas ingenting. Ett läsfel lämnar raden oskickad (nästa cron försöker igen), och en rad
 * köad för mer än 24 timmar sedan skickas aldrig (samma regel som de andra notiserna).
 *
 * "Väntar" = samma urval som raden i Lastbilen (useVantar): fakturaunderlag_flytt med status aktiv, ej fakturerad, ej godkänd.
 * Trycket öppnar fakturasidan för ÄLDSTA månaden med något som väntar, där "Vad ska du göra?" tar en flytt i taget.
 *
 * Ren modul (ingen Supabase-import): raderna hämtas av anroparen, så reglerna kan testas utan nätverk.
 */

import { sthlmDelar } from '@/lib/sthlmTid';

export const FLYTT_GODKANN = 'flytt_godkann';
export const arGodkannNotis = (typ: unknown): typ is typeof FLYTT_GODKANN => typ === FLYTT_GODKANN;

export const GODKANN_MAX_ALDER_MS = 24 * 60 * 60 * 1000;
/** Måndag (1) från 07:00 svensk tid. */
export const GODKANN_VECKODAG = 1;
export const GODKANN_FRAN_TIMME = 7;

export interface VantandeUnderlag { id: string; datum: string | null; km: number | null }

/** Ska påminnelsen köas nu? Bara på måndagen från 07:00 svensk tid; nyckeln gör att den köas en gång per måndag. */
export function godkannKoNyckel(nu: Date): string | null {
  const d = sthlmDelar(nu);
  if (!d) return null;
  const veckodag = new Date(Date.UTC(d.ar, d.man - 1, d.dag)).getUTCDay();
  if (veckodag !== GODKANN_VECKODAG || d.h < GODKANN_FRAN_TIMME) return null;
  return `godkann:${d.datum}`;
}

const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** Texten och länken ur det som väntar just nu. null = inget väntar (då skickas ingenting). */
export function godkannMeddelande(rader: readonly VantandeUnderlag[]): { title: string; body: string; url: string; tag: string } | null {
  if (rader.length === 0) return null;
  const n = rader.length;
  const datum = rader.map(r => r.datum).filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}/.test(d)).sort();
  const aldsta = datum[0] ?? null;
  const over3mil = rader.filter(r => r.km != null && r.km > 30).length;
  const delar = [
    aldsta ? `Äldsta från ${Number(aldsta.slice(8, 10))} ${MAN[Number(aldsta.slice(5, 7)) - 1]}` : null,
    over3mil > 0 ? `${over3mil} över 3 mil` : null,
  ].filter(Boolean);
  return {
    title: `${n} ${n === 1 ? 'flytt väntar' : 'flyttar väntar'} på godkännande`,
    body: [delar.join(' · '), 'De kommer inte med på fakturan förrän du godkänt dem.'].filter(Boolean).join('. '),
    url: aldsta ? `/lastbil?flik=fakturering&per=${aldsta.slice(0, 7)}` : '/lastbil?flik=fakturering',
    tag: 'flytt-godkann',
  };
}

export type HamtaVantande = () => Promise<{ rader: VantandeUnderlag[] | null; fel?: string }>;

export type GodkannNotisUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string }
  | { typ: 'uppskjut' };

/** Vid utskick: läs färskt. Allt godkänt → ingen push. Läsfel → uppskjut. För gammal → hoppa över. */
export async function byggGodkannNotis(
  n: { skapad_at?: string | null },
  hamta: HamtaVantande,
  nu: number = Date.now(),
): Promise<GodkannNotisUtfall> {
  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > GODKANN_MAX_ALDER_MS) return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' };
  const { rader, fel } = await hamta();
  if (fel || !rader) return { typ: 'uppskjut' };
  const m = godkannMeddelande(rader);
  if (!m) return { typ: 'hoppa_over', orsak: 'Ej skickad — alla flyttar är redan godkända' };
  return { typ: 'skicka', meddelande: m };
}
