/**
 * Verifierat sparande — skydd mot Supabases tysta 0-raders-fällor.
 *
 * En .update() som inte träffar några rader (fel id, RLS blockerar, raden
 * borttagen) ger INGET error från PostgREST — bara en tom lista. Kod som inte
 * kontrollerar det visar "Sparat!" medan databasen är orörd. Empiriskt
 * verifierat mot vår DB 2026-07-14 (förare mot annan förares rad: HTTP 200,
 * body []). En .upsert() som RLS blockerar ger däremot ett riktigt error
 * (42501) — men bara om koden faktiskt läser det.
 *
 * Därför: ALLA update/upsert som betyder något går genom de här funktionerna.
 * Regeln är enkel — inga träffade rader = inget sparat = fel, aldrig "Sparat!".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Förarvänligt: tekniska detaljer går till console, inte till föraren. */
export const SPARA_FEL = "Kunde inte spara — försök igen.";
export const SPARA_INGA_RADER =
  "Inget sparades — ändringen nådde inte databasen. Ladda om appen och försök igen.";

export type SparaResultat<T = any> =
  | { ok: true; rows: T[] }
  | { ok: false; fel: string };

/**
 * UPDATE som kräver att minst en rad träffades.
 * `match` blir kedjade .eq()-filter, `select` styr vad som returneras
 * (default 'id' — sätt '*' när den uppdaterade raden behövs).
 */
export async function uppdateraVerifierat<T = any>(
  klient: SupabaseClient,
  tabell: string,
  varden: Record<string, unknown>,
  match: Record<string, unknown>,
  select: string = "id",
): Promise<SparaResultat<T>> {
  try {
    let q: any = klient.from(tabell).update(varden);
    for (const [kol, v] of Object.entries(match)) {
      if (v === undefined || v === null) {
        // .eq(kol, undefined) blir ett trasigt filter som kan träffa fel rader
        console.error(`[spara] ${tabell}: match-värde för '${kol}' saknas — avbryter`, match);
        return { ok: false, fel: SPARA_INGA_RADER };
      }
      q = q.eq(kol, v);
    }
    const { data, error } = await q.select(select);
    if (error) {
      console.error(`[spara] ${tabell} update-fel:`, error);
      return { ok: false, fel: SPARA_FEL };
    }
    if (!data || data.length === 0) {
      console.error(`[spara] ${tabell} update träffade 0 rader — inget sparat.`, match);
      return { ok: false, fel: SPARA_INGA_RADER };
    }
    return { ok: true, rows: data as T[] };
  } catch (e) {
    console.error(`[spara] ${tabell} update kastade:`, e);
    return { ok: false, fel: SPARA_FEL };
  }
}

/**
 * UPSERT som kräver att raden kom tillbaka. RLS-block ger error (verifierat),
 * men .select()-kontrollen fångar också det tysta hörnfallet och ger enhetlig
 * hantering med uppdateraVerifierat.
 */
export async function upsertVerifierat<T = any>(
  klient: SupabaseClient,
  tabell: string,
  varden: Record<string, unknown> | Record<string, unknown>[],
  opts?: { onConflict?: string; select?: string },
): Promise<SparaResultat<T>> {
  try {
    const { data, error } = await klient
      .from(tabell)
      .upsert(varden as any, opts?.onConflict ? { onConflict: opts.onConflict } : undefined)
      .select(opts?.select ?? "id");
    if (error) {
      console.error(`[spara] ${tabell} upsert-fel:`, error);
      return { ok: false, fel: SPARA_FEL };
    }
    if (!data || data.length === 0) {
      console.error(`[spara] ${tabell} upsert gav 0 rader tillbaka — inget sparat.`);
      return { ok: false, fel: SPARA_INGA_RADER };
    }
    return { ok: true, rows: data as T[] };
  } catch (e) {
    console.error(`[spara] ${tabell} upsert kastade:`, e);
    return { ok: false, fel: SPARA_FEL };
  }
}
