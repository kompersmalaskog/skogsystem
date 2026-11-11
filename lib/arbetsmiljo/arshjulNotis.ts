/**
 * Påminnelsen om årshjulet (arbetsmiljö, 2026-11-11, Martin: "behöver människor göra det blir det inte gjort").
 *
 * EN push i månaden till aktiva admin och skyddsombud, första vardagen från 08:00 svensk tid, bara när något i årshjulet
 * är att göra (dags nu eller sent: riskbedömning, arbetsplatsträffar, hur vi mår, kemikalierna, skyddsrond, hur gick året):
 *   "Årshjulet: 3 saker att göra" · "Skyddsrond – skulle gjorts i oktober · Hur gick året? – dags nu · och 1 till" → /arbetsmiljo?ar=1
 *
 * Reglerna är årshjulets egna (byggArshjul) — samma rader som arket visar, ingen egen räkning.
 *
 * KÖAS av producenten koaArshjulPaminnelse (körs av /api/notis/flush) med skickas_at = 'infinity', som de andra arbetsmiljönotiserna:
 * den GAMLA flushen på production skickar okända typer som en generisk "Notis". dedup = år och månad → en gång i månaden.
 * Texten byggs FÄRSKT: inget att göra → ingenting skickas, läsfel → uppskjuts, köad för mer än 24 h sedan → hoppas över.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { byggArshjul, hamtaGjorda, svenskArManad, MANADER, type Rad } from './arshjul';
import { hamtaRonder } from './skyddsrond';
import { hamtaBedomningar } from './maskinRisk';

export const AM_ARSHJUL = 'am_arshjul';
export const arArshjulNotis = (typ: unknown): typ is typeof AM_ARSHJUL => typ === AM_ARSHJUL;

export const ARSHJUL_MAX_ALDER_MS = 24 * 60 * 60 * 1000;
/** Klockslaget (svensk tid) från vilket månadens påminnelse får köas. */
export const ARSHJUL_FRAN_TIMME = 8;
/** Så många punkter står med namn i texten; resten blir "och N till". */
export const ARSHJUL_I_TEXTEN = 2;

const VECKODAG: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Svensk veckodag (1 = måndag) och timme. */
export function svenskVeckodagTimme(nu: Date): { veckodag: number; timme: number } {
  const delar = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(nu);
  const wd = delar.find(p => p.type === 'weekday')?.value ?? '';
  const h = Number(delar.find(p => p.type === 'hour')?.value);
  return { veckodag: VECKODAG[wd] ?? 0, timme: Number.isFinite(h) ? h : 0 };
}

/** Får månadens påminnelse köas nu? Vardag från 08:00 svensk tid. Dedup gör att den bara går en gång i månaden. */
export function dagsAttKoa(nu: Date): boolean {
  const { veckodag, timme } = svenskVeckodagTimme(nu);
  return veckodag >= 1 && veckodag <= 5 && timme >= ARSHJUL_FRAN_TIMME;
}

export const arshjulDedup = (nu: Date) => {
  const { ar, manad } = svenskArManad(nu);
  return `arshjul:${ar}-${String(manad).padStart(2, '0')}`;
};

/** Det som står i raden för en punkt: "Skyddsrond – skulle gjorts i oktober" / "Hur gick året? – dags nu". */
function punktText(r: Rad, manad: number): string {
  if (r.punkt.manad < manad) return `${r.punkt.titel} – skulle gjorts i ${MANADER[r.punkt.manad - 1]}`;
  if (r.under.startsWith('Pågår')) return `${r.punkt.titel} – ${r.under.toLowerCase()}`;
  return `${r.punkt.titel} – dags nu`;
}

/** Pushens text. null = inget att göra (ingen push). Det äldsta först, som arket. */
export function arshjulText(rader: readonly Rad[], nu: Date): { title: string; body: string } | null {
  const att = rader.filter(r => r.attGora);
  if (att.length === 0) return null;
  const { manad } = svenskArManad(nu);
  const title = att.length === 1 ? `Årshjulet: ${att[0].punkt.titel}` : `Årshjulet: ${att.length} saker att göra`;
  const namn = att.slice(0, ARSHJUL_I_TEXTEN).map(r => punktText(r, manad));
  const rest = att.length - namn.length;
  return { title, body: rest > 0 ? `${namn.join(' · ')} · och ${rest} till` : namn.join(' · ') };
}

/** Läser årshjulet som arket gör. null = något gick inte att läsa (aldrig "inget att göra"). */
export async function lasArshjul(sb: SupabaseClient, nu: Date): Promise<Rad[] | null> {
  const { ar } = svenskArManad(nu);
  const [gjorda, ronder, risk] = await Promise.all([hamtaGjorda(sb, ar), hamtaRonder(sb), hamtaBedomningar(sb)]);
  if (!gjorda || !ronder || !risk) return null;
  return byggArshjul({ nu, gjorda, ronder, risk });
}

export type HamtaArshjul = () => Promise<Rad[] | null>;

export type ArshjulUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string }
  | { typ: 'uppskjut' };

export async function byggArshjulNotis(
  n: { typ: string; payload?: Record<string, unknown> | null; skapad_at?: string | null },
  hamta: HamtaArshjul,
  nu: Date = new Date(),
): Promise<ArshjulUtfall> {
  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu.getTime() - koad > ARSHJUL_MAX_ALDER_MS) return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' };
  const rader = await hamta();
  if (!rader) return { typ: 'uppskjut' };
  const text = arshjulText(rader, nu);
  if (!text) return { typ: 'hoppa_over', orsak: 'Ej skickad — inget att göra i årshjulet' };
  return { typ: 'skicka', meddelande: { ...text, url: '/arbetsmiljo?ar=1', tag: arshjulDedup(nu) } };
}

export type ArshjulKoRapport = { ok: boolean; koade: number; hoppade?: string; fel?: string };

/**
 * Producenten. Billig i onödan-fallet: före 08:00, helg eller redan köad denna månad → inga läsningar av årshjulet.
 * Ett fel stoppar aldrig resten av kön (flush fångar det).
 */
export async function koaArshjulPaminnelse(sb: SupabaseClient, nu: Date = new Date()): Promise<ArshjulKoRapport> {
  if (!dagsAttKoa(nu)) return { ok: true, koade: 0, hoppade: 'inte vardag från 08:00' };
  const dedup = arshjulDedup(nu);

  const redan = await sb.from('notis_kö').select('id').eq('typ', AM_ARSHJUL).eq('dedup_nyckel', dedup).limit(1);
  if (redan.error) return { ok: false, koade: 0, fel: `notis_kö: ${redan.error.message}` };
  if ((redan.data ?? []).length > 0) return { ok: true, koade: 0, hoppade: 'redan köad denna månad' };

  const rader = await lasArshjul(sb, nu);
  if (!rader) return { ok: false, koade: 0, fel: 'Årshjulet kunde inte läsas' };
  if (!arshjulText(rader, nu)) return { ok: true, koade: 0, hoppade: 'inget att göra' };

  const m = await sb.from('medarbetare').select('id, aktiv, roll, skyddsombud');
  if (m.error) return { ok: false, koade: 0, fel: `medarbetare: ${m.error.message}` };
  const mottagare = ((m.data ?? []) as { id: string; aktiv: boolean | null; roll: string | null; skyddsombud: boolean | null }[])
    .filter(x => x.aktiv !== false && (x.roll === 'admin' || x.skyddsombud === true));
  if (mottagare.length === 0) return { ok: false, koade: 0, fel: 'Ingen aktiv admin eller skyddsombud att påminna' };

  const ins = await sb.from('notis_kö')
    .upsert(mottagare.map(x => ({ mottagare_id: x.id, typ: AM_ARSHJUL, payload: {}, skickas_at: 'infinity', dedup_nyckel: dedup })),
      { onConflict: 'typ,mottagare_id,dedup_nyckel', ignoreDuplicates: true })
    .select('dedup_nyckel');
  if (ins.error) return { ok: false, koade: 0, fel: `notis_kö: ${ins.error.message}` };
  return { ok: true, koade: (ins.data ?? []).length };
}
