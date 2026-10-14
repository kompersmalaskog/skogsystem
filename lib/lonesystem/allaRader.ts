/**
 * Läser ALLA rader ur en fråga, sida för sida. PostgREST svarar högst 1000 rader per anrop, och en läsning utan `.range()` tappar tyst allt
 * efter rad 1000 (aldrig ett fel). Används av routerna som läser ett helt år av arbetsdag/extra_tid (/api/lon/arsovertid, /api/lon/arbetstid):
 * en vanlig läsning ger för LÅG övertid utan att något säger det (prod hade 823 arbetsdag-rader 2026-10-13, så gränsen nås runt december).
 *
 * `bygg` ska ge en NY fråga för varje sida (ett Supabase-frågeobjekt går inte att återanvända). Varje sida ordnas på `id` — en total
 * ordning; utan den kan `.range()` ge dubbletter och luckor mellan sidorna (se STATUS.md, paginerings-buggen 2026-08-24). Tabellen måste
 * alltså ha en kolumn `id`. Ett läsfel kastas (aldrig "inga rader").
 */
export const SIDSTORLEK = 1000;

export async function allaRader<T>(bygg: () => any): Promise<T[]> {
  const ut: T[] = [];
  for (let fran = 0; ; fran += SIDSTORLEK) {
    const r = await bygg().order("id", { ascending: true }).range(fran, fran + SIDSTORLEK - 1);
    if (r.error) throw r.error;
    ut.push(...((r.data || []) as T[]));
    if (!r.data || r.data.length < SIDSTORLEK) break;
  }
  return ut;
}
