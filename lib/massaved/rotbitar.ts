// Korta rotbitar — raden "Efter 3 m blev nästa bit timmer eller kubb" på vy=tre-m.
// Tolkar svaret från massaved_rotbitar (supabase/migrations/20261123111830_massaved_rotbitar.sql).
// Procenten räknas här av de två talen; databasen räknar bara stammarna.

export const ROTBITAR_MIN = 10;

export type Rotbitar = { rotbitar: number; nasta_sagbar: number };

/** Tolkar RPC-svaret. Allt som inte är två rimliga heltal är "ingen rad" (null) — aldrig ett gissat tal. */
export function tolkaRotbitar(svar: unknown): Rotbitar | null {
  if (!svar || typeof svar !== 'object') return null;
  const { rotbitar, nasta_sagbar } = svar as Record<string, unknown>;
  if (typeof rotbitar !== 'number' || typeof nasta_sagbar !== 'number') return null;
  if (!Number.isInteger(rotbitar) || !Number.isInteger(nasta_sagbar)) return null;
  if (rotbitar < 0 || nasta_sagbar < 0 || nasta_sagbar > rotbitar) return null;
  return { rotbitar, nasta_sagbar };
}

/** Hela procent av rotbitarna där stock nr 2 blev timmer eller kubb. Null under ROTBITAR_MIN rotbitar: för få för ett tal. */
export function rotbitarProcent(r: Rotbitar | null): number | null {
  if (!r || r.rotbitar < ROTBITAR_MIN) return null;
  return Math.round((100 * r.nasta_sagbar) / r.rotbitar);
}
