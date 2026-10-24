/**
 * Greppet över tid, serverns del: cachen i databasen (kalibrering_grepp_manad, migration 20261024093226) läses av vyn och räknas om av cron-jobbet — aldrig av den som
 * öppnar vyn. Läsningen och omräkningen delar de här funktionerna så att "ligger efter" betyder samma sak på båda ställena (`aktuell` ur kalibrering_grepp_status).
 *
 * Rena anrop mot en service-klient som skickas in; ingen auth här (rutterna avgör vem som får).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GreppRad } from "@/lib/kalibrering/greppTid";

export type StatusRad = { objekt_id: string; antal_stammar: number; antal_raknade: number; aktuell: boolean };
type SammanstallRad = { manad: string; tradslag: string; klass: string; stammar: number | string; steg: number | string; still: number | string; summa_andel: number | string };

/** PostgREST säger att funktionen saknas med PGRST202 (schema-cachen) eller 42883 (Postgres). */
export const funktionSaknas = (e: { code?: string; message?: string } | null): boolean =>
  !!e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist/i.test(e.message ?? ""));

export type StatusSvar =
  | { ok: true; objekt: StatusRad[] }
  | { ok: false; saknas: true }
  | { ok: false; saknas: false; fel: string };

export async function lasStatus(sb: SupabaseClient, maskinId: string): Promise<StatusSvar> {
  const r = await sb.rpc("kalibrering_grepp_status", { p_maskin: maskinId });
  if (r.error) return funktionSaknas(r.error) ? { ok: false, saknas: true } : { ok: false, saknas: false, fel: `status: ${r.error.message}` };
  return { ok: true, objekt: (r.data ?? []) as StatusRad[] };
}

/** Det som vyn visar: cachens rader, maskinens alla objekt ihop. Räknar ingenting. */
export async function lasRader(sb: SupabaseClient, maskinId: string): Promise<{ ok: true; rader: GreppRad[] } | { ok: false; fel: string }> {
  const r = await sb.rpc("kalibrering_grepp_sammanstall", { p_maskin: maskinId });
  if (r.error) return { ok: false, fel: `sammanstall: ${r.error.message}` };
  return {
    ok: true,
    rader: ((r.data ?? []) as SammanstallRad[]).map(x => ({
      manad: x.manad, tradslag: x.tradslag, klass: x.klass, stammar: Number(x.stammar), steg: Number(x.steg), still: Number(x.still), summaAndel: Number(x.summa_andel),
    })),
  };
}

export type OmrakningSvar = { maskin_id: string; klara: string[]; fel: string[]; kvar: number; saknas?: true; statusFel?: string };

/**
 * Räknar om de objekt som ligger efter, ETT åt gången, största först (ett objekt som tar slut på tidsbudgeten är då ett litet — snabbt — som får vänta till nästa körning).
 * Börjar inte på ett nytt objekt efter `budgetMs`; det största objektet tar några sekunder, så kör man med god marginal mot funktionens maxDuration.
 */
export async function raknaOmGrepp(sb: SupabaseClient, maskinId: string, budgetMs: number, start = Date.now()): Promise<OmrakningSvar> {
  const status = await lasStatus(sb, maskinId);
  if (!status.ok) return status.saknas ? { maskin_id: maskinId, klara: [], fel: [], kvar: 0, saknas: true } : { maskin_id: maskinId, klara: [], fel: [], kvar: 0, statusFel: status.fel };
  const efter = status.objekt.filter(o => !o.aktuell).sort((a, b) => b.antal_stammar - a.antal_stammar);
  const klara: string[] = [];
  const fel: string[] = [];
  for (const o of efter) {
    if (Date.now() - start > budgetMs) break;
    const r = await sb.rpc("kalibrering_grepp_rakna", { p_maskin: maskinId, p_objekt: o.objekt_id });
    if (r.error) fel.push(o.objekt_id); else klara.push(o.objekt_id);
  }
  return { maskin_id: maskinId, klara, fel, kvar: efter.length - klara.length - fel.length };
}
