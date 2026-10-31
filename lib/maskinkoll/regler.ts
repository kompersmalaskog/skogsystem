// Maskinkollen (skyddsronden) — ren logik, ingen Supabase. Spec: Claude Docs "Arbetsmiljö i Skogsystem – spec".
//
// Föraren svarar Ja/Nej på maskinens frågor en gång i månaden. Ja är ALLTID bra (frågorna formuleras så).
// Nej kräver ett foto; databasen skapar då en åtgärd (trigger am_svar_till_atgard). Sist ett kontrollfoto, som
// roterar per månad, så att föraren faktiskt går ut till maskinen. Databasen vägrar `klar` tills allt är besvarat.

/** Versionen av texten föraren godkänner första gången ("Jag gör maskinkollen på …"). Byt när texten ändras i sak. */
export const GODKANNANDE_VERSION = 'v1-2026-10-31';

/** Storage-bucket för maskinkollens foton (privat). Första mappen MÅSTE vara förarens medarbetare-id (RLS). */
export const MASKINKOLL_BUCKET = 'am-foton';

export type MaskinTyp = 'Harvester' | 'Forwarder' | 'Lastbil' | string;

export type Fraga = {
  id: string;
  kod: string;
  text: string;
  hjalptext: string | null;
  maskin_typ: string | null;
  foto_url: string | null;
  ordning: number;
};

export type Svar = {
  fraga_id: string;
  ok: boolean;
  foto_url: string | null;
  kommentar: string | null;
};

/** Frågorna för maskinen: alla maskiner (maskin_typ NULL) + maskinens typ, i `ordning`. Inaktiva hämtas aldrig. */
export function fragorFor(fragor: Fraga[], typ: MaskinTyp | null): Fraga[] {
  return fragor
    .filter((f) => f.maskin_typ == null || (typ != null && f.maskin_typ === typ))
    .slice()
    .sort((a, b) => a.ordning - b.ordning || a.kod.localeCompare(b.kod, 'sv'));
}

/** Samma dag en kalendermånad senare (31 jan → 28/29 feb, aldrig 3 mars). */
export function enManadSenare(d: Date): Date {
  const ut = new Date(d.getFullYear(), d.getMonth() + 1, 1, d.getHours(), d.getMinutes());
  const sista = new Date(ut.getFullYear(), ut.getMonth() + 1, 0).getDate();
  ut.setDate(Math.min(d.getDate(), sista));
  return ut;
}

/** Är det dags? Ingen klar koll alls → ja. Annars när en kalendermånad gått sedan den senaste (räknat i hela dagar). */
export function arDags(senasteKlar: string | Date | null | undefined, nu: Date = new Date()): boolean {
  if (!senasteKlar) return true;
  const klar = new Date(senasteKlar);
  if (Number.isNaN(klar.getTime())) return true;
  const forfaller = enManadSenare(new Date(klar.getFullYear(), klar.getMonth(), klar.getDate()));
  const idag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  return idag.getTime() >= forfaller.getTime();
}

/** Kontrollfotot roterar per månad — samma sak hela månaden, oavsett vem som gör kollen. */
export const KONTROLLFOTON = ['motorrummet', 'brandsläckarnas mätare', 'hyttens golv', 'kranens slangar', 'förbandslådan öppen'] as const;

export function kontrollfotoFor(nu: Date = new Date()): string {
  return KONTROLLFOTON[nu.getMonth() % KONTROLLFOTON.length];
}

const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

/** "30 november" — för "Nästa maskinkoll …". */
export function datumText(d: Date): string {
  return `${d.getDate()} ${MANADER[d.getMonth()]}`;
}

const sakert = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_');

/** `<medarbetare>/<maskinkoll>/<del>-<tid>.jpg`. Unik per foto — ett omtag blir en ny fil (Storage har ingen update-policy). */
export function fotoSokvag(medarbetareId: string, maskinkollId: string, del: string, tid: number): string {
  return `${sakert(medarbetareId)}/${sakert(maskinkollId)}/${sakert(del)}-${tid}.jpg`;
}

/** Hur många frågor som återstår, och första obesvarade (för "Fortsätt"). */
export function lage(fragor: Fraga[], svar: Svar[]): { besvarade: number; kvar: number; forstaObesvarade: number } {
  const svarade = new Set(svar.map((s) => s.fraga_id));
  const forsta = fragor.findIndex((f) => !svarade.has(f.id));
  const besvarade = fragor.filter((f) => svarade.has(f.id)).length;
  return { besvarade, kvar: fragor.length - besvarade, forstaObesvarade: forsta === -1 ? fragor.length : forsta };
}
