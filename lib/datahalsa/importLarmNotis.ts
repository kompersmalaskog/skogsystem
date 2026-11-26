// Importlarmet — "Importen felar" och "Importen fungerar igen" till admin.
//
// Köas av DATABASEN: pg_cron-jobbet 'import-larm' kör public.import_larm_kontroll() var 15:e minut, skriver raden
// 'import_live' i meta_datahalsa_status och lägger en rad per admin i notis_kö med typ 'import_larm' (något är fel)
// eller 'import_ok' (felet är borta). payload: { rubrik, titel, text, body, url: '/datahalsa' }.
//
// Texten skrivs av databasen och skickas som den står: titel = payload.rubrik, text = payload.text, ett tryck öppnar
// payload.url. Här finns bara reglerna runt omkring, samma som för övriga notistyper:
//   - köad för mer än 24 timmar sedan → hoppas över (ett gammalt larm är inte längre en nyhet; läget står i Datahälsa)
//   - länken måste vara en sökväg i appen, annars öppnas /datahalsa
//   - larm och "fungerar igen" delar tag, så telefonen visar det SENASTE läget i stället för båda efter varandra
//
// Typerna står också i flushens urval (flushUrval), så de skickas oavsett om databasen köar dem med skickas_at = now()
// eller 'infinity'. Med now() skickar den GAMLA flushen på production dem som en generisk "Notis" tills den här
// koden är släppt (se CLAUDE.md, "KÄND BRIST" under Ledighet).

export const IMPORT_LARM = 'import_larm';
export const IMPORT_OK = 'import_ok';
export const IMPORT_NOTIS_TYPER = [IMPORT_LARM, IMPORT_OK] as const;
export type ImportNotisTyp = (typeof IMPORT_NOTIS_TYPER)[number];

export const arImportNotis = (typ: unknown): typ is ImportNotisTyp => typ === IMPORT_LARM || typ === IMPORT_OK;

export const IMPORT_NOTIS_MAX_ALDER_MS = 24 * 60 * 60 * 1000;
export const IMPORT_NOTIS_LANK = '/datahalsa';
export const IMPORT_NOTIS_TAG = 'import-larm';

/** Titeln när databasens rad saknar rubrik. Notisen ska ändå säga vad den gäller. */
export const IMPORT_NOTIS_RUBRIK: Record<ImportNotisTyp, string> = {
  [IMPORT_LARM]: 'Importen felar',
  [IMPORT_OK]: 'Importen fungerar igen',
};

export type ImportNotisUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string };

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Bara sökvägar i appen: "/datahalsa", aldrig "//annan.sajt", "/\annan" eller en hel adress. */
export function sakerLank(v: unknown): string {
  const s = text(v);
  if (!s || !s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\')) return IMPORT_NOTIS_LANK;
  return s;
}

export function byggImportNotis(
  n: { typ?: unknown; payload?: Record<string, unknown> | null; skapad_at?: string | null },
  nu: number = Date.now(),
): ImportNotisUtfall {
  if (!arImportNotis(n.typ)) return { typ: 'hoppa_over', orsak: 'Ej skickad — okänd notistyp' };
  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > IMPORT_NOTIS_MAX_ALDER_MS) {
    return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' };
  }
  const p = n.payload ?? {};
  return {
    typ: 'skicka',
    meddelande: {
      title: text(p.rubrik) ?? text(p.titel) ?? IMPORT_NOTIS_RUBRIK[n.typ],
      body: text(p.text) ?? text(p.body) ?? '',
      url: sakerLank(p.url),
      tag: IMPORT_NOTIS_TAG,
    },
  };
}
