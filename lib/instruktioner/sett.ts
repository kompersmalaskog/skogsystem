// Förarens "sett" per kommentar: tabellen kommentar_sett_forare (migration 20261024102940, tiden sätts av servern) med en lokal kopia på enheten.
//
// Den lokala kopian är inte bara en cache: den gör att "sett" fungerar utan täckning och innan tabellen finns i databasen (saknas den, PGRST205, gäller enhetens
// kopia). Servern och enheten slås ihop per kommentar — den nyaste vinner. Det enhetens kopia har och servern saknar skickas när det går.


export const SETT_TABELL = 'kommentar_sett_forare';

interface Klient { from: (tabell: string) => any }

export interface SettPost { hash: string; tid: string }
/** ref → när och med vilken text kommentaren sågs. */
export type SettLager = Record<string, SettPost>;

const lokalNyckel = (objektId: string, forareId: string): string => `instruktion_sett_v1:${objektId}:${forareId}`;

const minne = new Map<string, SettLager>();

export function lasLokaltSett(objektId: string, forareId: string): SettLager {
  const nyckel = lokalNyckel(objektId, forareId);
  try {
    const rad = JSON.parse(localStorage.getItem(nyckel) || 'null');
    if (rad && typeof rad === 'object') {
      const ut: SettLager = {};
      for (const [ref, v] of Object.entries(rad as Record<string, any>)) if (v && typeof v.hash === 'string' && typeof v.tid === 'string') ut[ref] = { hash: v.hash, tid: v.tid };
      return ut;
    }
  } catch { /* privat läge: minnesreserven */ }
  return minne.get(nyckel) ?? {};
}

export function skrivLokaltSett(objektId: string, forareId: string, lager: SettLager): void {
  const nyckel = lokalNyckel(objektId, forareId);
  minne.set(nyckel, lager);
  try { localStorage.setItem(nyckel, JSON.stringify(lager)); } catch { /* minnesreserven räcker medan appen är öppen */ }
}

/** Bara för tester. */
export function nollstallSett(): void {
  minne.clear();
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('instruktion_sett_v1:')) localStorage.removeItem(k); } catch { /* */ }
}

/** Den nyaste posten per kommentar vinner (servern sätter tiden; enhetens tid är enhetens klocka, så vid lika tid gäller servern). */
export function slaIhopSett(server: SettLager, lokal: SettLager): SettLager {
  const ut: SettLager = { ...server };
  for (const [ref, p] of Object.entries(lokal)) {
    const s = ut[ref];
    if (!s || (s.hash !== p.hash && p.tid > s.tid)) ut[ref] = p;
  }
  return ut;
}

/** Det enheten har som servern saknas eller har en äldre version av. */
export function attSkicka(server: SettLager, lokal: SettLager): string[] {
  return Object.entries(lokal).filter(([ref, p]) => !server[ref] || (server[ref].hash !== p.hash && p.tid > server[ref].tid)).map(([ref]) => ref);
}

export const settKarta = (lager: SettLager): Map<string, string> => new Map(Object.entries(lager).map(([ref, p]) => [ref, p.hash]));

export async function hamtaSett(db: Klient, objektId: string, forareId: string): Promise<{ lager: SettLager; fel: string | null }> {
  try {
    const { data, error } = await db.from(SETT_TABELL).select('kommentar_ref, innehall_hash, sett_at').eq('objekt_id', objektId).eq('forare_id', forareId);
    if (error || !Array.isArray(data)) return { lager: {}, fel: String(error?.message ?? 'ogiltigt svar') };
    const lager: SettLager = {};
    for (const r of data as any[]) lager[String(r.kommentar_ref)] = { hash: String(r.innehall_hash ?? ''), tid: String(r.sett_at ?? '') };
    return { lager, fel: null };
  } catch (e) { return { lager: {}, fel: String((e as Error)?.message ?? e) }; }
}

export interface SparaSettPost { ref: string; nyckel: string; hash: string }

/** Skriver sett till servern (UPSERT på objekt + förare + kommentar). Returnerar felet som text, null när det gick. */
export async function sparaSett(db: Klient, objektId: string, forareId: string, poster: readonly SparaSettPost[]): Promise<string | null> {
  if (!poster.length) return null;
  try {
    const { error } = await db.from(SETT_TABELL).upsert(
      poster.map((p) => ({ objekt_id: objektId, forare_id: forareId, kommentar_ref: p.ref, yta_nyckel: p.nyckel || null, innehall_hash: p.hash })),
      { onConflict: 'objekt_id,forare_id,kommentar_ref' },
    );
    return error ? String(error.message ?? error) : null;
  } catch (e) { return String((e as Error)?.message ?? e); }
}
