// Vidas geometri (objekt_geometri) sparad PÅ ENHETEN (Martin 2026-11-16: "hur får vi appen så snabb som Spotify" — visa det sparade först, hämta sen).
//
// Mätningen (fart_logg, 13–16 nov) visade att objekt_geometri var det enskilt segaste i appen: 591 sega läsningar, 24 minuters väntan på tre dagar.
// Maskinerna hämtade HELA tabellen (37 trakter, 6,8 MB) var 5:e minut för positionsvalet, och varje öppnad trakt hämtade sin geometri (upp till 760 kB)
// på nytt. Geometrin ändras bara när Vida levererar om trakten.
//
// Regeln: en liten fråga (id + skapad, några hundra byte) säger om det sparade fortfarande gäller; bara det som ändrats hämtas.
//   • VERSION = radens id + skapad. Importen (`/api/import-trakt`) tar bort raden och lägger in en ny → nytt id och ny tid → det sparade byts ut.
//     En UPDATE för hand i SQL ändrar INTE versionen: sätt `skapad = now()` i samma sats, annars gäller det sparade i upp till MAX_ALDER_MS.
//   • Det sparade är en SPEGEL av servern, aldrig ett eget val. Servern går alltid före när den svarar.
//   • Svarar servern inte (ingen täckning) gäller det sparade — larmen för kraftledning och hänsyn fungerar då också utan nät (`gammal: true`,
//     anroparen frågar igen när nätet kommer). Förut: ingen geometri alls och raden "Vidas lager saknas – larmar inte".
//   • Ett TOMT svar utan fel rör aldrig det sparade (en utgången session ger tomma rader utan fel, objekt_geometri har RLS) och ger tomt svar som förut,
//     så att anroparens regler om "tomt för en Vida-trakt = fel, förnya sessionen" gäller oförändrade.
// Lagret är IndexedDB (en trakt kan vara 760 kB — för stort för localStorage); går det inte att öppna (privat läge) används minnet.

export const GEO_DB = 'skogsystem-geometri';
export const GEO_STORE = 'geometri';
/** Skyddsnät mot en ändring som inte bytte version (UPDATE för hand): äldre sparat än så här hämtas om även när versionen stämmer. */
export const MAX_ALDER_MS = 7 * 24 * 3600_000;

export interface GeoPost { objektId: string; version: string; geometri: any; sparad: number }
export interface GeoLager {
  las(objektId: string): Promise<GeoPost | null>;
  lasFlera(objektIds: readonly string[]): Promise<Map<string, GeoPost>>;
  skriv(post: GeoPost): Promise<void>;
}
export interface VersionRad { objekt_id: string; id: string | number; skapad: string | null }

/** Versionen för ett objekt ur dess rader (normalt en). Ordningen på raderna spelar ingen roll. */
export function geoVersion(rader: readonly VersionRad[]): string {
  return rader.map((r) => `${r.id}@${r.skapad ?? ''}`).sort().join('|');
}

/** Versioner per objekt ur en lista versionsrader. */
export function versionerPerObjekt(rader: readonly VersionRad[]): Map<string, string> {
  const grupper = new Map<string, VersionRad[]>();
  for (const r of rader) { const g = grupper.get(String(r.objekt_id)); if (g) g.push(r); else grupper.set(String(r.objekt_id), [r]); }
  const ut = new Map<string, string>();
  grupper.forEach((g, id) => ut.set(id, geoVersion(g)));
  return ut;
}

/** Gäller det sparade? Samma version och inte äldre än skyddsnätet. */
export function sparatGaller(post: GeoPost | null | undefined, version: string, nu: number): post is GeoPost {
  return !!post && post.version === version && nu - post.sparad < MAX_ALDER_MS && nu >= post.sparad - 60_000;
}

/** Vilka objekt måste hämtas från servern? De som finns på servern (i `onskade`) och saknar ett sparat som gäller. */
export function attHamta(versioner: ReadonlyMap<string, string>, sparade: ReadonlyMap<string, GeoPost>, onskade: readonly string[] | null, nu: number): string[] {
  const ids = onskade ? onskade.filter((id) => versioner.has(id)) : Array.from(versioner.keys());
  return ids.filter((id) => !sparatGaller(sparade.get(id), versioner.get(id)!, nu));
}

// ── Lagret ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export function minnesLager(): GeoLager {
  const m = new Map<string, GeoPost>();
  return {
    async las(id) { return m.get(id) ?? null; },
    async lasFlera(ids) { const ut = new Map<string, GeoPost>(); for (const id of ids) { const p = m.get(id); if (p) ut.set(id, p); } return ut; },
    async skriv(p) { m.set(p.objektId, p); },
  };
}

function oppna(): Promise<IDBDatabase> {
  return new Promise((ja, nej) => {
    const q = indexedDB.open(GEO_DB, 1);
    q.onupgradeneeded = () => { if (!q.result.objectStoreNames.contains(GEO_STORE)) q.result.createObjectStore(GEO_STORE, { keyPath: 'objektId' }); };
    q.onsuccess = () => ja(q.result);
    q.onerror = () => nej(q.error);
    q.onblocked = () => nej(new Error('blockerad'));
  });
}
const vanta = <T,>(q: IDBRequest<T>): Promise<T> => new Promise((ja, nej) => { q.onsuccess = () => ja(q.result); q.onerror = () => nej(q.error); });

function idbLager(): GeoLager {
  let db: Promise<IDBDatabase> | null = null;
  const d = () => (db ??= oppna());
  return {
    async las(id) { const s = (await d()).transaction(GEO_STORE, 'readonly').objectStore(GEO_STORE); return (await vanta(s.get(id))) ?? null; },
    async lasFlera(ids) {
      const s = (await d()).transaction(GEO_STORE, 'readonly').objectStore(GEO_STORE);
      const svar = await Promise.all(ids.map((id) => vanta(s.get(id))));
      const ut = new Map<string, GeoPost>();
      svar.forEach((p, i) => { if (p) ut.set(ids[i], p as GeoPost); });
      return ut;
    },
    async skriv(p) { const s = (await d()).transaction(GEO_STORE, 'readwrite').objectStore(GEO_STORE); await vanta(s.put(p)); },
  };
}

let delat: GeoLager | null = null;
/** Enhetens lager: IndexedDB, annars minnet. Ett fel i lagret får aldrig fälla en läsning — då gäller servern som förut. */
export function geoLager(): GeoLager {
  if (delat) return delat;
  const minne = minnesLager();
  if (typeof indexedDB === 'undefined') return (delat = minne);
  const idb = idbLager();
  const trygg = <A extends any[], R>(f: (...a: A) => Promise<R>, reserv: (...a: A) => Promise<R>) => async (...a: A): Promise<R> => { try { return await f(...a); } catch { return reserv(...a); } };
  return (delat = { las: trygg(idb.las, minne.las), lasFlera: trygg(idb.lasFlera, minne.lasFlera), skriv: trygg(async (p) => { await idb.skriv(p); await minne.skriv(p); }, minne.skriv) });
}

// ── Läsningarna ─────────────────────────────────────────────────────────────────────────────────────────────────────

type Db = { from: (tabell: string) => any };
export interface GeoSvar { data: { geometri: any } | null; error: any; /** servern svarade inte: det sparade gäller tills vidare */ gammal?: boolean; /** versionen av det som returneras (saknas när inget finns) */ version?: string }

/** Det sparade för ett objekt, direkt och utan nät (null när inget finns). För "visa det sparade först". */
export async function lasSparadGeometri(objektId: string, lager: GeoLager = geoLager()): Promise<GeoPost | null> {
  try { return await lager.las(objektId); } catch { return null; }
}

/**
 * Ett objekts geometri: samma svar som `select('geometri').eq('objekt_id', id).maybeSingle()`, men hämtar bara när versionen ändrats.
 * Svarar servern inte gäller det sparade (`gammal: true`). Tomt svar utan fel ger `data: null` och rör inte det sparade.
 */
export async function lasGeometriMedCache(db: Db, objektId: string, lager: GeoLager = geoLager(), nu: () => number = Date.now): Promise<GeoSvar> {
  // Versionsfrågan går iväg DIREKT, samtidigt som det sparade läses — ingen väntan på lagret innan nätet får börja.
  const kast = (e: any) => ({ data: null, error: e ?? new Error('okänt fel') });
  let fraga: Promise<{ data: any; error: any }>;
  // `.then` anropas direkt (inte via await), så frågan lämnar enheten i samma ögonblick.
  try { fraga = Promise.resolve(db.from('objekt_geometri').select('objekt_id,id,skapad').eq('objekt_id', objektId).then((x: any) => x, kast)); } catch (e) { fraga = Promise.resolve(kast(e)); }
  const sparad = await lasSparadGeometri(objektId, lager);
  const reserv = (error: any): GeoSvar => (sparad ? { data: { geometri: sparad.geometri }, error: null, gammal: true, version: sparad.version } : { data: null, error });
  const v = await fraga;
  if (v.error) return reserv(v.error);
  const rader: VersionRad[] = v.data ?? [];
  if (rader.length === 0) return { data: null, error: null };
  const version = geoVersion(rader);
  if (sparatGaller(sparad, version, nu())) return { data: { geometri: sparad.geometri }, error: null, version };
  let g: { data: any; error: any };
  try { g = await db.from('objekt_geometri').select('geometri').eq('objekt_id', objektId).maybeSingle(); } catch (e) { return reserv(e); }
  if (g.error) return reserv(g.error);
  if (g.data?.geometri) { try { await lager.skriv({ objektId, version, geometri: g.data.geometri, sparad: nu() }); } catch { /* lagret är fullt eller stängt: servern gällde ändå */ } }
  return { data: g.data ?? null, error: null, version: g.data?.geometri ? version : undefined };
}

export interface GeoFleraSvar { data: { objekt_id: string; geometri: any }[] | null; error: any; /** antal objekt med geometri på servern (alla, inte bara de önskade) */ paServern: number }

/**
 * Geometrin för flera objekt (`onskade`; null = alla): EN liten versionsfråga, sedan hämtas bara det som saknas eller ändrats.
 * Ett fel i någon fråga är ett fel (anroparen försöker igen) — här används aldrig gammalt sparat i stället, positionsvalet ska bygga på det servern säger.
 */
export async function lasGeometrierMedCache(db: Db, onskade: readonly string[] | null, lager: GeoLager = geoLager(), nu: () => number = Date.now): Promise<GeoFleraSvar> {
  const v = await db.from('objekt_geometri').select('objekt_id,id,skapad');
  if (v.error) return { data: null, error: v.error, paServern: 0 };
  const versioner = versionerPerObjekt(v.data ?? []);
  const ids = onskade ? onskade.filter((id) => versioner.has(id)) : Array.from(versioner.keys());
  let sparade = new Map<string, GeoPost>();
  try { sparade = await lager.lasFlera(ids); } catch { /* inget sparat: allt hämtas */ }
  const t = nu();
  const hamta = attHamta(versioner, sparade, ids, t);
  const nya = new Map<string, any>();
  if (hamta.length) {
    const g = await db.from('objekt_geometri').select('objekt_id,geometri').in('objekt_id', hamta);
    if (g.error) return { data: null, error: g.error, paServern: versioner.size };
    for (const r of g.data ?? []) {
      nya.set(String(r.objekt_id), r.geometri);
      try { await lager.skriv({ objektId: String(r.objekt_id), version: versioner.get(String(r.objekt_id))!, geometri: r.geometri, sparad: t }); } catch { /* */ }
    }
  }
  const data: { objekt_id: string; geometri: any }[] = [];
  for (const id of ids) {
    if (nya.has(id)) data.push({ objekt_id: id, geometri: nya.get(id) });
    else if (!hamta.includes(id) && sparade.has(id)) data.push({ objekt_id: id, geometri: sparade.get(id)!.geometri });
  }
  return { data, error: null, paServern: versioner.size };
}
