/**
 * KLAVE OCH MÅTTBAND — när kontrollerades de senast? (Kalibrering › Läget, 2026-11-18)
 *
 * Skogforsk: maskinen jämförs mot klaven och måttbandet. Mäter de själva fel blir hela kontrollen fel, så klaven kontrolleras
 * mot en klavmall och måttbandet mot ett stålmåttband. Appen påminner en gång i kvartalet (`MATDON_DAGAR`).
 *
 * Tabellen `kalibrering_matdon` (migration 20261118092924_kalibrering_matdon.sql, körd i prod 2026-11-18): en rad = båda stämde, för en maskin.
 * Tid och vem sätts av databasen. Läsfel är ett fel, aldrig "aldrig kollat".
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fmtDagMan } from './datum';

/** Ett kvartal. Äldre än så (eller aldrig) = dags att kolla. */
export const MATDON_DAGAR = 92;
const DAG_MS = 86_400_000;

export type MatdonKoll = { id: string; at: string; av: string | null };

export type MatdonLage = {
  /** "Kollade 3 sep" / "Aldrig kollade" */
  varde: string;
  /** "Dags att kolla" när det gått mer än ett kvartal, annars null. */
  under: string | null;
  dags: boolean;
};

/** Läget för maskinens mätdon. `senaste` = den nyaste kontrollen, null = ingen någonsin. */
export function matdonLage(senaste: MatdonKoll | null, nu: Date = new Date()): MatdonLage {
  if (!senaste) return { varde: 'Aldrig kollade', under: 'Dags att kolla', dags: true };
  const dags = nu.getTime() - Date.parse(senaste.at) > MATDON_DAGAR * DAG_MS;
  return { varde: `Kollade ${fmtDagMan(svenskDag(senaste.at))}`, under: dags ? 'Dags att kolla' : null, dags };
}

/** Svensk dag (YYYY-MM-DD) för en tidpunkt. */
export function svenskDag(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/** Hur man gör, i tre steg. Står i arket. */
export const MATDON_STEG = [
  'Lägg klaven mot klavmallen. Den ska visa samma mått som mallen.',
  'Dra ut måttbandet bredvid ett stålmåttband. De ska visa samma längd.',
  'Stämmer båda? Tryck på knappen.',
] as const;

/** Senaste kontrollen för en maskin. `null` = inga kontroller; kastar vid läsfel. */
export async function hamtaSenasteMatdon(sb: SupabaseClient, maskinId: string): Promise<MatdonKoll | null> {
  // Inget namn: förare får inte läsa andras medarbetarrader. Datumet räcker.
  const { data, error } = await sb.from('kalibrering_matdon')
    .select('id, kontrollerad_at, kontrollerad_av')
    .eq('maskin_id', maskinId).order('kontrollerad_at', { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  const r = (data ?? [])[0] as { id: string; kontrollerad_at: string; kontrollerad_av: string | null } | undefined;
  return r ? { id: r.id, at: r.kontrollerad_at, av: r.kontrollerad_av } : null;
}
