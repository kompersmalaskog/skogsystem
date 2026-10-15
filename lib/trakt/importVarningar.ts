// Importvarningar i /api/import-trakt: skrivningen av varningslistan får varken fälla importen eller tappas tyst.
//
// `import_varningar` är en jsonb-KOLUMN på `objekt` (migration 20260805_6_objekt_dokument_varningar.sql), inte en egen tabell. Den skrivs i
// samma INSERT/UPDATE som resten av objektet. Förut innebar det att en kolumn som PostgREST inte känner till (migrationen ej körd,
// schemacachen gammal) fällde HELA skrivningen: 500, inget objekt sparat, felet bara i import_fel.
//
// Nu: avvisas skrivningen just för att `import_varningar` inte går att skriva, skrivs objektet om UTAN kolumnen (importen går igenom) och
// varningarna sparas i stället i import_fel (synliga i /datahalsa "Tappades något vid import?") och i svaret (`varningarSparade: false`,
// som objektsidan visar). Alla andra fel är oförändrade — de fäller importen som förut.

export interface DbFel { code?: string | null; message?: string | null }

/** Skrivfelet kommer av att `import_varningar` inte går att skriva (kolumnen saknas i schemat) — inget annat fel. */
export function arVarningskolumnFel(e: DbFel | null | undefined): boolean {
  if (!e) return false;
  const msg = String(e.message ?? '');
  if (!/import_varningar/i.test(msg)) return false;
  return e.code === 'PGRST204' || e.code === '42703' || /column|schema cache|does not exist/i.test(msg);
}

/**
 * Kolumner importen skriver men som kan saknas i en databas där migrationen ännu inte körts. Saknas en av dem ska objektet ändå sparas
 * (importen får inte falla för en kolumn) — men aldrig tyst: se `ejSkrivnaKolumner` och `rapporteraEjSkrivnaKolumner`.
 *   import_varningar            20260805_6_objekt_dokument_varningar.sql
 *   avtalsform, import_varden   20261014125836_avtalsform_och_import_varden.sql
 */
export const VALFRIA_KOLUMNER = ['import_varningar', 'avtalsform', 'import_varden'] as const;

/** Vilken valfri kolumn skrivfelet gäller (PostgREST "Could not find the 'x' column …" / Postgres 42703) — null om det är något annat fel. */
export function saknadValfriKolumn(e: DbFel | null | undefined): string | null {
  if (!e) return null;
  const msg = String(e.message ?? '');
  const schemaFel = e.code === 'PGRST204' || e.code === '42703' || /column|schema cache|does not exist/i.test(msg);
  if (!schemaFel) return null;
  for (const k of VALFRIA_KOLUMNER) if (new RegExp(`\\b${k}\\b`, 'i').test(msg)) return k;
  return null;
}

export interface TolerantSkrivning<T> {
  data: T | null;
  error: DbFel | null;
  /** false = objektet skrevs utan varningskolumnen; varningarna måste tas om hand på annat håll */
  varningarSparade: boolean;
  /** felet som avvisade första skrivningen (bara när varningarSparade är false) */
  kolumnFel?: string;
  /** varningarna som INTE hamnade i kolumnen (kan vara tom om det inte fanns några) */
  ejSparade: string[];
  /** valfria kolumner som avvisades och därför INTE skrevs (t.ex. avtalsform, import_varden när migrationen inte är körd) */
  ejSkrivnaKolumner: string[];
}

/**
 * Kör `skriv(payload)`. Avvisas den för att en valfri kolumn saknas (se VALFRIA_KOLUMNER) körs den igen utan just den kolumnen, tills den går
 * igenom. Övriga fel returneras som de är. Anroparen avgör vad som händer med `ejSparade`/`ejSkrivnaKolumner` (se rapportera…-funktionerna).
 */
export async function skrivObjektTolerantMotVarningskolumn<T>(
  payload: Record<string, any>,
  skriv: (p: Record<string, any>) => PromiseLike<{ data: T | null; error: DbFel | null }>,
): Promise<TolerantSkrivning<T>> {
  let p = payload;
  const ejSkrivna: string[] = [];
  let forstaFel: string | undefined;
  for (;;) {
    const r = await skriv(p);
    const kol = r.error ? saknadValfriKolumn(r.error) : null;
    if (!r.error || !kol || !(kol in p)) {
      const varningarBortfallna = ejSkrivna.includes('import_varningar');
      return {
        data: r.data,
        error: r.error,
        varningarSparade: !r.error && !varningarBortfallna,
        kolumnFel: varningarBortfallna ? forstaFel : undefined,
        ejSparade: varningarBortfallna && Array.isArray(payload.import_varningar) ? payload.import_varningar.map(String) : [],
        ejSkrivnaKolumner: ejSkrivna,
      };
    }
    forstaFel ??= String(r.error.message ?? '');
    ejSkrivna.push(kol);
    const { [kol]: _bort, ...utan } = p;
    p = utan;
  }
}

/**
 * Loggar ett misslyckat eller ofullständigt trakt-importförsök i import_fel (läses av /datahalsa "Tappades något vid import?"), så att det
 * syns i appen i stället för att bli en föräldralös fil i trakt-inbox som ingen tittar i (Wisent-läxan: tyst tapp upptäcks aldrig). En död
 * funktion (OOM/timeout) kan inte logga sig själv — då loggar klienten via /api/import-trakt/logga-fel. Best-effort — men aldrig tyst: supabase-js KASTAR INTE, den returnerar `{ error }`, så ett catch ensamt
 * (som förut) fångade aldrig ett misslyckat insert. Returnerar om raden faktiskt skrevs; annars står texten i serverloggen.
 */
export async function loggaImportFel(service: any, filnamn: string | null, felkod: string, feltext: string): Promise<boolean> {
  const text = (feltext ?? '').slice(0, 2000);
  try {
    const { error } = await service.from('import_fel').insert({ tabell: 'objekt', filnamn, felkod, feltext: text });
    if (error) {
      console.error(`Kunde inte logga import_fel (${felkod}): ${error.message ?? error.code ?? 'okänt fel'} — ${filnamn ?? '?'}: ${text}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`Kunde inte logga import_fel (${felkod}): ${(e as any)?.message ?? e} — ${filnamn ?? '?'}: ${text}`);
    return false;
  }
}

/**
 * Efter en skrivning utan varningskolumnen: lägg varningarna där någon ser dem. Returnerar om de syns i import_fel
 * (annars finns de bara i svaret och i serverloggen — och då är `sparadeIFel` false så att klienten kan säga det).
 */
export async function rapporteraEjSparadeVarningar(
  service: any, filnamn: string | null, objektNamn: string | null, s: Pick<TolerantSkrivning<unknown>, 'kolumnFel' | 'ejSparade'>,
): Promise<boolean> {
  const lista = s.ejSparade.length > 0 ? s.ejSparade.map((v, i) => `${i + 1}. ${v}`).join(' | ') : '(inga varningar den här gången)';
  const text = `Objektet ${objektNamn ?? ''} sparades, men varningslistan kunde inte skrivas till objekt.import_varningar (${s.kolumnFel ?? 'okänt fel'}). `
    + `Kör migrationen 20260805_6_objekt_dokument_varningar.sql. Varningar: ${lista}`;
  return loggaImportFel(service, filnamn, 'VARNINGAR_EJ_SPARADE', text);
}

/**
 * En valfri kolumn (avtalsform, import_varden) kunde inte skrivas för att migrationen inte är körd. Då har importen tappat uppgifter
 * (avtalsformen, och minnet som skyddar handrättningar vid nästa omimport) — det loggas i import_fel (syns i /datahalsa).
 */
export async function rapporteraEjSkrivnaKolumner(service: any, filnamn: string | null, objektNamn: string | null, kolumner: string[]): Promise<boolean> {
  const nyaKolumner = kolumner.filter((k) => k !== 'import_varningar');
  if (nyaKolumner.length === 0) return true;
  const text = `Objektet ${objektNamn ?? ''} sparades, men kolumnerna ${nyaKolumner.join(', ')} saknas i databasen och skrevs inte. `
    + 'Kör migrationen 20261014125836_avtalsform_och_import_varden.sql och importera om.';
  return loggaImportFel(service, filnamn, 'KOLUMN_SAKNAS', text);
}
