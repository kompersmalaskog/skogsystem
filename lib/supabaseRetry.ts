// Supabase-js auth-lås-abort — härdning.
//
// @supabase/auth-js (2.111) serialiserar session/token-hämtning mellan flikar
// via navigator.locks och wrappar låset i en AbortController. Kan låset inte
// tas inom timeouten — kall serverless-start, långsam token-refresh, eller en
// annan flik som håller låset — anropas abortController.abort() och frågan
// misslyckas med "AbortError: signal is aborted without reason". Det är
// TRANSIENT: nästa försök lyckas när låset släppts / token cachats.
//
// medAbortRetry gör därför om en fråga som fallit på just en abort (aldrig på
// ett riktigt fel — det returneras direkt). arAbortFel känner igen aborten så
// UI:t kan välja en vänlig "Försök igen" i stället för att visa felsträngen.

export function arAbortFel(error: any): boolean {
  if (!error) return false
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase()
  return text.includes('abort') || text.includes('signal is aborted')
}

/**
 * Kör en supabase-fråga och gör om den vid abort-fel (upp till `forsok` gånger,
 * kort växande backoff). Tunken `gor` måste bygga en FÄRSK query-builder varje
 * gång (en redan-await:ad builder kan inte köras om) — skicka därför en pil:
 *   medAbortRetry(() => supabase.from('x').select('*'))
 * Riktiga fel (RLS, nätverk, syntax) returneras direkt utan omförsök.
 */
export async function medAbortRetry<T = any>(
  gor: () => PromiseLike<{ data: T; error: any }>,
  forsok = 3,
): Promise<{ data: T; error: any }> {
  let res = await gor()
  for (let i = 1; i < forsok && res.error && arAbortFel(res.error); i++) {
    await new Promise(r => setTimeout(r, 250 * i))
    res = await gor()
  }
  return res
}

/** Postgres avbröt frågan på statement_timeout (8 s för inloggade). */
export function arTimeoutFel(error: any): boolean {
  return !!error && (error?.code === '57014' || /statement timeout/i.test(error?.message ?? ''))
}

/**
 * Gör om en TUNG läsning EN gång om den föll på tidsgränsen. Databasens arbetsminne (256 MB) rymmer inte stock- och
 * stamtabellerna (2,2 GB): första läsningen efter att annat trängt ut dem går mot disk och kan nå 8 s, andra läsningen
 * ligger i minnet (affar_oversikt för ett år: ~2,8 s varm mot 6,5–7,8 s kall, uppmätt 2026-10-23). Bara för läsningar
 * som är ofarliga att köra två gånger. Andra fel returneras direkt.
 */
export async function medTimeoutRetry<T = any>(
  gor: () => PromiseLike<{ data: T; error: any }>,
): Promise<{ data: T; error: any }> {
  const res = await gor()
  return res.error && arTimeoutFel(res.error) ? await gor() : res
}
