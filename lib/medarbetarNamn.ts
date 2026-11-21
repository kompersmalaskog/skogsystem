// Namnet på den som skrev en kommentar, svarade på en larmplats eller tog ett foto — för alla som är inloggade, också maskinen.
//
// medarbetare-tabellen är stängd: en förare (och därmed ett maskinkonto) ser bara sin EGEN rad, så en inbäddad läsning (`medarbetare:skapad_av(namn)`) ger
// null för alla andra och kommentaren stod som "Okänd". Databasfunktionen medarbetare_visning(ids) lämnar ut just NAMNET (förnamn för en person,
// maskinens namn för ett maskinkonto) — inget telefonnummer, ingen roll, inget annat — och bara för de id:n man ber om. Läsning som misslyckas
// (funktionen saknas, inget nät) lämnar raderna som de var: aldrig ett fel, aldrig ett gissat namn.
import { supabase } from '@/lib/supabase'

type Db = { rpc?: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }

export async function hamtaVisningsnamn(ids: ReadonlyArray<string | null | undefined>, db: Db = supabase as unknown as Db): Promise<Map<string, string>> {
  const ut = new Map<string, string>()
  const unika = [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0))]
  if (!unika.length || typeof db.rpc !== 'function') return ut
  try {
    for (let i = 0; i < unika.length; i += 200) {
      const { data, error } = await db.rpc('medarbetare_visning', { p_ids: unika.slice(i, i + 200) })
      if (error || !Array.isArray(data)) continue
      for (const r of data as Array<{ id?: unknown; namn?: unknown }>) if (typeof r.id === 'string' && typeof r.namn === 'string' && r.namn.trim()) ut.set(r.id, r.namn.trim())
    }
  } catch { /* namnen är ett tillägg */ }
  return ut
}

/** Fyller i namn på de rader där den inbäddade läsningen inte gav något (en annan persons rad ligger bakom radnivåspärren). Raderna som har namn rörs aldrig. */
export async function kompletteraNamn<T>(
  rader: T[], id: (r: T) => string | null | undefined, namn: (r: T) => string | null | undefined, satt: (r: T, n: string) => T, db?: Db,
): Promise<T[]> {
  const saknas = rader.filter((r) => !namn(r) && id(r)).map((r) => id(r) as string)
  if (!saknas.length) return rader
  const m = await hamtaVisningsnamn(saknas, db)
  if (!m.size) return rader
  return rader.map((r) => { const i = id(r); const n = !namn(r) && i ? m.get(i) : undefined; return n ? satt(r, n) : r })
}
