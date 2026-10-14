// Läsare som behöver `avtalsform` (vindfälle = avtalsform VF/Bark) ska inte gå sönder om migrationen
// 20261015090000_avtalsform_och_import_varden.sql ännu inte är körd: PostgREST svarar då med fel för HELA frågan.
// Hjälparna kör frågan med kolumnen och, om just den saknas, en gång till utan — vyn får samma data som före migrationen.

export function arAvtalsformKolumnFel(e: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!e) return false;
  const msg = String(e.message ?? '');
  if (!/\bavtalsform\b/i.test(msg)) return false;
  return e.code === '42703' || e.code === 'PGRST204' || /column|schema cache|does not exist/i.test(msg);
}

/** För hämtare som KASTAR vid fel (t.ex. en lokal sidvis hämtare). */
export async function medAvtalsformEllerUtan<T>(kor: (medAvtalsform: boolean) => Promise<T>): Promise<T> {
  try {
    return await kor(true);
  } catch (e: any) {
    if (arAvtalsformKolumnFel(e)) return kor(false);
    throw e;
  }
}

/** För hämtare som RETURNERAR { data, error }. */
export async function medAvtalsformSvar<R extends { error: any }>(kor: (medAvtalsform: boolean) => PromiseLike<R>): Promise<R> {
  const svar = await kor(true);
  if (svar.error && arAvtalsformKolumnFel(svar.error)) return kor(false);
  return svar;
}
