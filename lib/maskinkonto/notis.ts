// "Många fel koder" — en push till admin när någon gissat tio fel koder i rad på en maskin (en timmes väntan har då satts i databasen).
//
//   "Många fel koder för Oskar Nilsson på H8E -26" / "10 fel i rad. Maskinen är spärrad för det namnet i en timme."
//
// Köas med skickas_at = 'infinity' (den gamla flushen på production skickar okända typer som en generisk "Notis" — se CLAUDE.md) till varje aktiv admin
// UTOM personen själv, dedup per person och spärr (till-tiden), och körs direkt av rutten via /api/notis/flush (annars nästa cron, högst 5 min).
// Texten byggs av payloaden vid utskick; köad för mer än 24 timmar sedan → hoppas över. Aldrig något om koden — bara vem, var och hur många.
import type { SupabaseClient } from '@supabase/supabase-js';

export const MASKIN_KOD_SPAR = 'maskin_kod_spar';
export const arMaskinKodNotis = (typ: unknown): typ is typeof MASKIN_KOD_SPAR => typ === MASKIN_KOD_SPAR;
export const MASKIN_KOD_MAX_ALDER_MS = 24 * 60 * 60 * 1000;

export type MaskinKodUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string };

export function byggMaskinKodNotis(
  n: { payload?: Record<string, unknown> | null; skapad_at?: string | null },
  nu: number = Date.now(),
): MaskinKodUtfall {
  const p = n.payload ?? {};
  const namn = typeof p.namn === 'string' && p.namn ? p.namn : null;
  const maskin = typeof p.maskin_namn === 'string' && p.maskin_namn ? p.maskin_namn : null;
  if (!namn || !maskin) return { typ: 'hoppa_over', orsak: 'Ej skickad — notisen saknar namn eller maskin' };
  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > MASKIN_KOD_MAX_ALDER_MS) return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' };
  return {
    typ: 'skicka',
    meddelande: {
      title: `Många fel koder för ${namn} på ${maskin}`,
      body: '10 fel i rad. Maskinen är spärrad för det namnet i en timme.',
      url: '/admin?flik=medarbetare',
      tag: `maskin-kod-${String(p.medarbetare_id ?? namn)}-${String(p.till ?? '')}`,
    },
  };
}

export type KoaRapport = { ok: boolean; koade: number; skickades: boolean; fel?: string };

/** Köar notisen till aktiva admin (utom personen) och kör flushen direkt. Ett fel här får aldrig påverka svaret till maskinen. */
export async function koaMaskinKodSparr(
  sb: SupabaseClient,
  a: { medarbetareId: string; namn: string; maskinId: string; maskinNamn: string; till: string | null },
  req?: Request,
): Promise<KoaRapport> {
  try {
    const m = await sb.from('medarbetare').select('id, aktiv').eq('roll', 'admin');
    if (m.error) return { ok: false, koade: 0, skickades: false, fel: `medarbetare: ${m.error.message}` };
    const admins = ((m.data ?? []) as { id: string; aktiv: boolean | null }[]).filter((x) => x.aktiv !== false && x.id !== a.medarbetareId).map((x) => x.id);
    if (admins.length === 0) return { ok: true, koade: 0, skickades: false };
    const rader = admins.map((id) => ({
      mottagare_id: id, typ: MASKIN_KOD_SPAR, skickas_at: 'infinity', dedup_nyckel: `kodspar:${a.medarbetareId}:${a.till ?? ''}`,
      payload: { medarbetare_id: a.medarbetareId, namn: a.namn, maskin_id: a.maskinId, maskin_namn: a.maskinNamn, till: a.till },
    }));
    const ins = await sb.from('notis_kö').upsert(rader, { onConflict: 'typ,mottagare_id,dedup_nyckel', ignoreDuplicates: true }).select('dedup_nyckel');
    if (ins.error) return { ok: false, koade: 0, skickades: false, fel: `notis_kö: ${ins.error.message}` };
    const koade = (ins.data ?? []).length;
    let skickades = false;
    if (koade > 0 && req) {
      try {
        const headers: Record<string, string> = {};
        const secret = process.env.CRON_SECRET;
        if (secret) headers.authorization = `Bearer ${secret}`;
        const res = await fetch(new URL('/api/notis/flush', req.url), { method: 'POST', headers });
        skickades = res.ok;
      } catch { /* raden är köad och tas av nästa cron */ }
    }
    return { ok: true, koade, skickades };
  } catch (e) {
    return { ok: false, koade: 0, skickades: false, fel: e instanceof Error ? e.message : String(e) };
  }
}

// ── "Välj din kod för <maskin>" — skickas till personens telefon när hen står utan kod i "Vem är du?" på maskinen ──
//
//   "Välj din kod för H8E -26" / "Tryck här och välj fyra siffror. Då kan du logga in på maskinen."  → /?kod=1 (öppnar Mer › Kod för maskinen)
//
// Notisen innehåller aldrig koden eller något personligt — bara maskinens namn. Köas med skickas_at = 'infinity' (den gamla flushen skickar okända
// typer som en generisk "Notis"), dedup per begäran (tidpunkten som databasen gav), och körs direkt via /api/notis/flush. Texten byggs färskt vid
// utskick: har personen redan valt kod hoppas den över, läsfel skjuter upp, köad för mer än en timme sedan hoppas över.
export const MASKIN_KOD_VAL = 'maskin_kod_val';
export const arKodValNotis = (typ: unknown): typ is typeof MASKIN_KOD_VAL => typ === MASKIN_KOD_VAL;
export const KOD_VAL_MAX_ALDER_MS = 60 * 60 * 1000;
export const KOD_VAL_URL = '/?kod=1';
/** Högst en notis per person och två minuter — samma tal som databasfunktionen maskin_kod_notis_begar. */
export const KOD_NOTIS_MIN_MS = 2 * 60 * 1000;

export type KodValUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string }
  | { typ: 'uppskjut' };

/** harKod: true/false, eller null när det inte gick att läsa (då skjuts utskicket upp — aldrig en gissning). */
export async function byggKodValNotis(
  n: { mottagare_id?: string | null; payload?: Record<string, unknown> | null; skapad_at?: string | null },
  harKod: (medarbetareId: string) => Promise<boolean | null>,
  nu: number = Date.now(),
): Promise<KodValUtfall> {
  const p = n.payload ?? {};
  const maskin = typeof p.maskin_namn === 'string' && p.maskin_namn ? p.maskin_namn : null;
  if (!maskin || !n.mottagare_id) return { typ: 'hoppa_over', orsak: 'Ej skickad — notisen saknar maskin eller mottagare' };
  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > KOD_VAL_MAX_ALDER_MS) return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än en timme sedan)' };
  const finns = await harKod(n.mottagare_id);
  if (finns === null) return { typ: 'uppskjut' };
  if (finns) return { typ: 'hoppa_over', orsak: 'Ej skickad — personen har redan valt sin kod' };
  return {
    typ: 'skicka',
    meddelande: {
      title: `Välj din kod för ${maskin}`,
      body: 'Tryck här och välj fyra siffror. Då kan du logga in på maskinen.',
      url: KOD_VAL_URL,
      tag: `maskin-kod-val-${n.mottagare_id}`,
    },
  };
}

/** Köar notisen till personens telefon(er) och kör flushen direkt. `tid` = tidpunkten databasfunktionen loggade begäran på (dedup per begäran). */
export async function koaKodVal(
  sb: SupabaseClient,
  a: { medarbetareId: string; maskinNamn: string; tid: string },
  req?: Request,
): Promise<KoaRapport> {
  try {
    const ins = await sb.from('notis_kö').upsert([{
      mottagare_id: a.medarbetareId, typ: MASKIN_KOD_VAL, skickas_at: 'infinity', dedup_nyckel: `kodval:${a.medarbetareId}:${a.tid}`,
      payload: { maskin_namn: a.maskinNamn },
    }], { onConflict: 'typ,mottagare_id,dedup_nyckel', ignoreDuplicates: true }).select('dedup_nyckel');
    if (ins.error) return { ok: false, koade: 0, skickades: false, fel: `notis_kö: ${ins.error.message}` };
    const koade = (ins.data ?? []).length;
    let skickades = false;
    if (koade > 0 && req) {
      try {
        const headers: Record<string, string> = {};
        const secret = process.env.CRON_SECRET;
        if (secret) headers.authorization = `Bearer ${secret}`;
        const res = await fetch(new URL('/api/notis/flush', req.url), { method: 'POST', headers });
        skickades = res.ok;
      } catch { /* raden är köad och tas av nästa cron */ }
    }
    return { ok: true, koade, skickades };
  } catch (e) {
    return { ok: false, koade: 0, skickades: false, fel: e instanceof Error ? e.message : String(e) };
  }
}
