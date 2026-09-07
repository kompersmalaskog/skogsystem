// Hämta ALLA rader ur en tabell/vy — PostgREST kapar tyst vid 1000 rader per svar.
//
// .range() utan ORDER BY är instabil (samma rad kan komma två gånger, en annan
// aldrig), så anroparen anger en unik sorteringsnyckel — en kolumn eller flera
// (t.ex. ['objekt_id', 'roll'] när första kolumnen inte är unik). Loopar tills
// en sida är kortare än sidstorleken. Första felet returneras direkt — aldrig
// en halv lista som ser komplett ut.

export const SIDSTORLEK = 1000

// Strukturell typ i stället för PostgrestFilterBuilder:s generics — de byter
// form mellan supabase-js-versioner, det här är allt vi använder.
type Byggare = {
  order(kolumn: string, alternativ: { ascending: boolean }): Byggare
  range(fran: number, till: number): PromiseLike<{ data: any; error: any }>
}

export async function hamtaAlla<T = any>(
  bygg: () => Byggare,
  ordning: string | string[],
  sidstorlek = SIDSTORLEK,
): Promise<{ data: T[]; error: any }> {
  const alla: T[] = []
  const kolumner = Array.isArray(ordning) ? ordning : [ordning]
  for (let fran = 0; ; fran += sidstorlek) {
    let q = bygg()
    for (const k of kolumner) q = q.order(k, { ascending: true })
    const { data, error } = await q.range(fran, fran + sidstorlek - 1)
    if (error) return { data: [], error }
    const sida = (data ?? []) as T[]
    alla.push(...sida)
    if (sida.length < sidstorlek) break
  }
  return { data: alla, error: null }
}
