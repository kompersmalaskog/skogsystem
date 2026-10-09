// HYTTSPÅRETS RADNYCKEL — med eller utan objekt.
//
// En hyttspår-rad är EN rad per (objekt, roll, datum) (unique i 20260904_hyttspar). Skyddsnätet för maskindatorn när ingen svarar på
// "Inget objekt här — Starta jobb?" loggar spåret ändå med objekt_id = NULL. En unik nyckel dedupar aldrig NULL (NULL ≠ NULL i Postgres),
// så en rad utan objekt hittas på MASKINEN i stället: (objekt_id IS NULL, maskin_id, roll, datum) — med en partiell unik index som
// migrationen 20261009110000_starta_jobb_ursprung_hor_till lägger till. En rad utan objekt MÅSTE alltså ha maskin_id.
//
// Rena funktioner, inga DB-anrop (bara query-byggaren skickas in) → testbara (hyttsparNyckel.test.ts).

export type HyttRoll = 'skordare' | 'skotare';

export interface HyttsparCtx {
  /** null = ingen objekt-koppling än (skyddsnätet) — raden hör till maskinen tills ett objekt täcker spåret. */
  objektId: string | null;
  roll: HyttRoll;
  maskinId: string | null;
}

/** Strukturell minsta delmängd av supabase-js filterbyggare (så testet kan skicka en fake). */
export interface HyttsparFilterbar<Q> {
  eq(kol: string, v: unknown): Q;
  is(kol: string, v: null): Q;
}

/** Kan spåret loggas för det här sammanhanget? Med objekt alltid; utan objekt bara när maskinen är känd (nyckeln är maskin_id). */
export function kanLoggaHyttspar(ctx: Pick<HyttsparCtx, 'objektId' | 'maskinId'>): boolean {
  if (ctx.objektId) return true;
  return !!(ctx.maskinId && ctx.maskinId.trim());
}

/** Lägg raden-för-dagen-filtret på en query (roll + datum + objekt-ELLER-maskin). Kastar aldrig; ogiltigt utan-objekt-sammanhang ger ett filter som inte träffar något. */
export function filtreraHyttsparRad<Q extends HyttsparFilterbar<Q>>(q: Q, ctx: HyttsparCtx, datum: string): Q {
  if (ctx.objektId) return q.eq('objekt_id', ctx.objektId).eq('roll', ctx.roll).eq('datum', datum);
  // Utan objekt: raden är maskinens. Saknas maskin matchas ingenting (ett tomt maskin_id får aldrig plocka någon annans rad).
  return q.is('objekt_id', null).eq('maskin_id', ctx.maskinId ?? '').eq('roll', ctx.roll).eq('datum', datum);
}

/** Insert-payloaden för en ny rad. objekt_id null när sammanhanget saknar objekt. */
export function hyttsparInsertRad(ctx: HyttsparCtx, datum: string, points: unknown[]): Record<string, unknown> {
  return { objekt_id: ctx.objektId ?? null, roll: ctx.roll, datum, maskin_id: ctx.maskinId, points, status: 'recording' };
}
