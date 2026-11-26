// Läser ALLA rader, sida för sida. PostgREST ger högst 1 000 rader per fråga och
// säger inget om resten — utan sidläsning räknades Björn Martinsson Svinhult A
// (1 044 produktionsrader) på en del av datan, utan att något syntes.
//
// Frågan måste sorteras på en unik kolumn (id), annars kan en rad hoppa mellan
// två sidor. Ett fel på VILKEN sida som helst är ett fel för hela läsningen —
// aldrig en halv lista som ser ut som hela.

export const SIDA = 1000;

type Svar<T> = { data: T[] | null; error: { message?: string } | null };

export async function lasAllaSidor<T = any>(
  bygg: (fran: number, till: number) => PromiseLike<Svar<T>>,
): Promise<{ data: T[] | null; error: { message?: string } | null }> {
  const alla: T[] = [];
  for (let fran = 0; ; fran += SIDA) {
    const { data, error } = await bygg(fran, fran + SIDA - 1);
    if (error) return { data: null, error };
    const rader = data ?? [];
    alla.push(...rader);
    if (rader.length < SIDA) return { data: alla, error: null };
  }
}
