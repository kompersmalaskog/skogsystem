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
