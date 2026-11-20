/**
 * NYA OCH ÄNDRADE MARKERINGAR SKA NÅ ANDRA SKÄRMAR PÅ SEKUNDER (Martin 2026-11-13: en symbol satt bredvid maskinen tog
 * upp till tio minuter att komma fram – förut hämtades markeringarna bara om när de var 10 min gamla eller appen kom fram igen;
 * bara borttagningar gick direkt).
 *
 * Databasen säger till (realtime INSERT/UPDATE på objektets rader) och sidan hämtar om. Rena regler här; sidan kopplar.
 */

/** Så länge samlas en skur av händelser (flera symboler i rad, en ritad väg som numreras om) till EN hämtning. */
export const LIVE_SAMLA_MS = 400;

/**
 * Reserven när realtime inte når fram (tappad anslutning, strypt flik): i maskinen hämtas markeringarna om när de är så här gamla.
 * Planeringen på telefon/dator behåller sina 10 min (lib/farskhet) – där är det planeraren själv som ritar.
 */
export const LIVE_RESERV_MASKIN_MIN = 1;

interface MedTs { id: unknown; andradTs?: unknown }

/**
 * Är händelsen ett eko av det den här skärmen själv just sparade? Då finns markeringen redan i minnet med SAMMA ändringstid,
 * och en hämtning vore onödig. Allt annat – okänd markering, annan tid, en rad utan tid eller en payload som inte går att läsa – hämtas.
 */
export function arEgetEko(rad: unknown, iMinnet: readonly MedTs[]): boolean {
  if (!rad || typeof rad !== 'object') return false;
  const r = rad as { marker_id?: unknown; data?: unknown };
  if (r.marker_id == null || !r.data || typeof r.data !== 'object') return false;
  const ts = Number((r.data as { andradTs?: unknown }).andradTs);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  const m = iMinnet.find((x) => String(x.id) === String(r.marker_id));
  return !!m && Number(m.andradTs) === ts;
}

/** Hur gammal får kartans markeringar bli innan de hämtas om av sig själva? */
export function farskhetGransMin(maskinlage: boolean, vanligMin: number): number {
  return maskinlage ? Math.min(vanligMin, LIVE_RESERV_MASKIN_MIN) : vanligMin;
}
