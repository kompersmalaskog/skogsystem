/**
 * Pushen "Maskinen ska stå" — en åtgärd med stopp har skapats (Nej på en stoppfråga i maskinkollen, eller
 * "går inte att köra säkert" i Något är fel).
 *
 *   am_stopp → admin och skyddsombud (utom den som rapporterade): "Giant ska stå" / "Nödstoppet stannar inte motorn · Stefan"
 *   → /atgarder?id=<åtgärd>
 *
 * KÖAS av triggern kö_am_stopp på am_atgard (migration *_arbetsmiljo_stopp_notis.sql) med skickas_at = 'infinity' — som
 * ledighet, lass och inventarier: den GAMLA flushen på production skickar okända typer som en generisk "Notis". Den nya
 * flushen tar typen oavsett skickas_at (`flushUrval`).
 *
 * Texten byggs FÄRSKT vid utskick ur åtgärden som den ser ut just då. Borta (föraren ändrade Nej till Ja), stängd eller inte
 * längre stopp → ingenting skickas. Läsfel → uppskjuts. Köad för mer än 24 timmar sedan → hoppas över.
 *
 * Ren modul (ingen Supabase-import): raden hämtas av anroparen.
 */

export const AM_STOPP = 'am_stopp';
export const arStoppNotis = (typ: unknown): typ is typeof AM_STOPP => typ === AM_STOPP;

export const STOPP_MAX_ALDER_MS = 24 * 60 * 60 * 1000;

export type StoppNotisRad = {
  id: string;
  status: string;
  stopp: boolean;
  beskrivning: string;
  maskin_namn: string | null;
  rapportor_namn: string | null;
};

/** `rad: null` = åtgärden finns inte. `fel` = läsningen misslyckades (inte samma sak som "finns inte"). */
export type HamtaStopp = (atgardId: string) => Promise<{ rad: StoppNotisRad | null; fel?: string }>;

export type StoppNotisUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string }
  | { typ: 'uppskjut' };

/** Pushens text tål inte en hel fråga; den kortas vid ordgräns. */
export function kortaText(text: string, max = 90): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const klipp = t.slice(0, max);
  const ord = klipp.lastIndexOf(' ');
  return `${(ord > max / 2 ? klipp.slice(0, ord) : klipp).replace(/[\s,.;:–—-]+$/, '')} …`;
}

export function stoppNotisText(rad: StoppNotisRad): { title: string; body: string } {
  const maskin = rad.maskin_namn?.trim() || 'En maskin';
  const vem = rad.rapportor_namn?.trim().split(/\s+/)[0];
  return { title: `${maskin} ska stå`, body: [kortaText(rad.beskrivning), vem].filter(Boolean).join(' · ') };
}

export async function byggStoppNotis(
  n: { typ: string; payload?: Record<string, unknown> | null; skapad_at?: string | null },
  hamta: HamtaStopp,
  nu: number = Date.now(),
): Promise<StoppNotisUtfall> {
  const id = n.payload?.atgard_id;
  if (typeof id !== 'string' || !id) return { typ: 'hoppa_over', orsak: 'Ej skickad — notisen saknar åtgärd' };

  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > STOPP_MAX_ALDER_MS) {
    return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' };
  }

  const { rad, fel } = await hamta(id);
  if (fel) return { typ: 'uppskjut' };
  if (!rad) return { typ: 'hoppa_over', orsak: 'Ej skickad — åtgärden finns inte längre' };
  if (rad.status !== 'oppen') return { typ: 'hoppa_over', orsak: 'Ej skickad — åtgärden är redan åtgärdad' };
  if (!rad.stopp) return { typ: 'hoppa_over', orsak: 'Ej skickad — inte längre ett stopp' };

  return {
    typ: 'skicka',
    meddelande: { ...stoppNotisText(rad), url: `/atgarder?id=${encodeURIComponent(rad.id)}`, tag: `am-stopp-${rad.id}` },
  };
}
