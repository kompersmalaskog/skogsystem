/**
 * Påminnelsen "Kolla klaven och måttbandet" (Kalibrering, 2026-11-18). En gång i kvartalet per maskin — bara när maskinens mätdon
 * INTE kollats senaste `MATDON_DAGAR` dagarna (eller aldrig). Går till förarna som har maskinen (`medarbetare.maskin_id`), vardag
 * från 07:00 svensk tid:
 *   "Kolla klaven och måttbandet · Giant" / "Senast 3 sep. Klaven mot mallen, måttbandet mot ett stålmåttband." → /kalibrering?matdon=<maskin>
 *
 * Köas av koaMatdonPaminnelse (körs av /api/notis/flush) med skickas_at = 'infinity' (den gamla flushen på production skickar okända
 * typer som en generisk "Notis"). dedup = maskin + kvartal → högst en per förare, maskin och kvartal.
 * Texten byggs FÄRSKT: kollad sedan köandet → ingen push, läsfel → uppskjuts, köad för mer än 24 h sedan → hoppas över.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fmtDagMan } from './datum';
import { hamtaSenasteMatdon, matdonLage, svenskDag, type MatdonKoll } from './matdon';

export const KALIB_MATDON = 'kalib_matdon';
export const arMatdonNotis = (typ: unknown): typ is typeof KALIB_MATDON => typ === KALIB_MATDON;

export const MATDON_MAX_ALDER_MS = 24 * 60 * 60 * 1000;
export const MATDON_FRAN_TIMME = 7;

const VECKODAG: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Vardag från 07:00 svensk tid. */
export function dagsAttKoaMatdon(nu: Date): boolean {
  const delar = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(nu);
  const vd = VECKODAG[delar.find(p => p.type === 'weekday')?.value ?? ''] ?? 0;
  const h = Number(delar.find(p => p.type === 'hour')?.value);
  return vd >= 1 && vd <= 5 && h >= MATDON_FRAN_TIMME;
}

/** "matdon:R64428:2026-Q4" — kvartalet i svensk tid. */
export function matdonDedup(maskinId: string, nu: Date): string {
  const [ar, man] = svenskDag(nu.toISOString()).split('-').map(Number);
  return `matdon:${maskinId}:${ar}-Q${Math.floor((man - 1) / 3) + 1}`;
}

/** Pushens text. null = mätdonen är kollade (ingen push). */
export function matdonText(namn: string, senaste: MatdonKoll | null, nu: Date): { title: string; body: string } | null {
  if (!matdonLage(senaste, nu).dags) return null;
  const nar = senaste ? `Senast ${fmtDagMan(svenskDag(senaste.at))}.` : 'Aldrig kollade i appen.';
  return { title: `Kolla klaven och måttbandet · ${namn}`, body: `${nar} Klaven mot mallen, måttbandet mot ett stålmåttband.` };
}

export type MatdonUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string }
  | { typ: 'uppskjut' };

export type HamtaMatdon = (maskinId: string) => Promise<{ namn: string; senaste: MatdonKoll | null } | null>;

export async function byggMatdonNotis(
  n: { payload?: Record<string, unknown> | null; skapad_at?: string | null; dedup_nyckel?: string | null },
  hamta: HamtaMatdon,
  nu: Date = new Date(),
): Promise<MatdonUtfall> {
  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu.getTime() - koad > MATDON_MAX_ALDER_MS) return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' };
  const maskin = typeof n.payload?.maskin_id === 'string' ? n.payload.maskin_id : null;
  if (!maskin) return { typ: 'hoppa_over', orsak: 'Ej skickad — maskin saknas i notisen' };
  const d = await hamta(maskin);
  if (!d) return { typ: 'uppskjut' };
  const text = matdonText(d.namn, d.senaste, nu);
  if (!text) return { typ: 'hoppa_over', orsak: 'Ej skickad — klaven och måttbandet är redan kollade' };
  return { typ: 'skicka', meddelande: { ...text, url: `/kalibrering?matdon=${encodeURIComponent(maskin)}`, tag: n.dedup_nyckel ?? matdonDedup(maskin, nu) } };
}

/** Läsningen för byggMatdonNotis. null = läsfel. */
export function lasMatdon(sb: SupabaseClient): HamtaMatdon {
  return async maskin => {
    try {
      const [m, senaste] = await Promise.all([
        sb.from('dim_maskin').select('visningsnamn').eq('maskin_id', maskin).maybeSingle(),
        hamtaSenasteMatdon(sb, maskin),
      ]);
      if (m.error) return null;
      return { namn: (m.data as { visningsnamn?: string | null } | null)?.visningsnamn?.trim() || 'maskinen', senaste };
    } catch {
      return null;
    }
  };
}

export type MatdonKoRapport = { ok: boolean; koade: number; hoppade?: string; fel?: string };

/** Producenten. Före 07:00 eller helg → inga läsningar. Ett fel för en maskin stoppar inte de andra. */
export async function koaMatdonPaminnelse(sb: SupabaseClient, nu: Date = new Date()): Promise<MatdonKoRapport> {
  if (!dagsAttKoaMatdon(nu)) return { ok: true, koade: 0, hoppade: 'inte vardag från 07:00' };
  const idag = svenskDag(nu.toISOString());

  const mk = await sb.from('dim_maskin').select('maskin_id, aktiv_till').eq('maskin_typ', 'Harvester');
  if (mk.error) return { ok: false, koade: 0, fel: `dim_maskin: ${mk.error.message}` };
  const maskiner = ((mk.data ?? []) as { maskin_id: string; aktiv_till: string | null }[])
    .filter(m => !m.aktiv_till || m.aktiv_till >= idag).map(m => m.maskin_id);

  let koade = 0;
  const fel: string[] = [];
  for (const maskin of maskiner) {
    const dedup = matdonDedup(maskin, nu);
    const redan = await sb.from('notis_kö').select('id').eq('typ', KALIB_MATDON).eq('dedup_nyckel', dedup).limit(1);
    if (redan.error) { fel.push(`${maskin}: ${redan.error.message}`); continue; }
    if ((redan.data ?? []).length > 0) continue;

    let senaste: MatdonKoll | null;
    try { senaste = await hamtaSenasteMatdon(sb, maskin); } catch (e) { fel.push(`${maskin}: ${(e as Error).message}`); continue; }
    if (!matdonLage(senaste, nu).dags) continue;

    const f = await sb.from('medarbetare').select('id, aktiv').eq('maskin_id', maskin);
    if (f.error) { fel.push(`${maskin}: ${f.error.message}`); continue; }
    const mottagare = ((f.data ?? []) as { id: string; aktiv: boolean | null }[]).filter(x => x.aktiv !== false);
    if (mottagare.length === 0) continue;

    const ins = await sb.from('notis_kö')
      .upsert(mottagare.map(x => ({ mottagare_id: x.id, typ: KALIB_MATDON, payload: { maskin_id: maskin }, skickas_at: 'infinity', dedup_nyckel: dedup })),
        { onConflict: 'typ,mottagare_id,dedup_nyckel', ignoreDuplicates: true })
      .select('dedup_nyckel');
    if (ins.error) { fel.push(`${maskin}: ${ins.error.message}`); continue; }
    koade += (ins.data ?? []).length;
  }
  return fel.length ? { ok: false, koade, fel: fel.join('; ') } : { ok: true, koade };
}
