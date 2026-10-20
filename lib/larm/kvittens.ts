// Kvittens PER FÖRARE (tabellen korvy_kvittens_forare, migration 20261020091340). Tystar bara den som kvitterat.
// TIDEN sätts av SERVERN (trigger, migration 20261020100544): klienten skickar ingen tid och kan inte ange en.
// Röd (fara) kvitteras också — som bevis för egenkontrollen — men tystas aldrig (lib/larm/larm).

import type { Kvittens, KvittensKarta } from './larm';

interface Klient { from: (tabell: string) => any }

export const KVITTENS_TABELL = 'korvy_kvittens_forare';

/** Förarens egna kvitteringar på objektet. En annan förares rader läses aldrig in (RLS ger dem bara till admin, och vi filtrerar ändå). */
export async function hamtaKvittens(db: Klient, objektId: string, forareId: string): Promise<{ karta: KvittensKarta; fel: string | null }> {
  const { data, error } = await db.from(KVITTENS_TABELL).select('marker_id, innehall_hash, kvitterad_at, forare_id').eq('objekt_id', objektId).eq('forare_id', forareId);
  if (error) return { karta: new Map(), fel: String(error.message ?? error) };
  const karta = new Map<string, Kvittens>();
  for (const r of (data ?? []) as any[]) karta.set(String(r.marker_id), { hash: r.innehall_hash ?? '', forareId: String(r.forare_id), tid: r.kvitterad_at });
  return { karta, fel: null };
}

export interface KvittensIn {
  objektId: string; markerId: string; forareId: string; forareNamn?: string | null;
  typ?: string | null; namn?: string | null; grupp?: string | null; hash: string;
}

export async function sparaKvittens(db: Klient, k: KvittensIn): Promise<string | null> {
  const { error } = await db.from(KVITTENS_TABELL).upsert(
    {
      objekt_id: k.objektId, marker_id: k.markerId, forare_id: k.forareId, forare_namn: k.forareNamn ?? null,
      marker_type: k.typ ?? null, marker_name: k.namn ?? null, grupp: k.grupp ?? null, innehall_hash: k.hash,
    },
    { onConflict: 'objekt_id,marker_id,forare_id' },
  );
  return error ? String(error.message ?? error) : null;
}

export function medKvittens(karta: KvittensKarta, id: string, k: Kvittens): KvittensKarta {
  const ny = new Map(karta); ny.set(id, k); return ny;
}
