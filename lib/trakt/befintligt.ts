// Omimport av en trakt (app/api/import-trakt): finns objektet redan? Två uppslag, i den ordningen:
//   1. objekt.vo_nummer == leveransens VO-nummer                         (som förut — oförändrat)
//   2. objekt_alt_nummer.nummer == leveransens VO-nummer                  (NYTT)
// (2) täcker både vanliga extra nummer och det GAMLA numret efter att importen bytt objektets vo_nummer (byte_till satt): Vida kan
// leverera trakten med ett nummer objektet inte längre har som vo_nummer, och då ska det befintliga objektet uppdateras — aldrig en ny
// rad (en dubblett av objektet, med egen planering och egna hyttspår).
//
// Läsfel är aldrig "ingen träff": ett fel som annars skulle leda till INSERT stoppar importen i stället (den går att köra om).
// Saknas tabellen (migrationen ej körd) finns inga extra nummer → som förut.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface BefintligtObjekt {
  id: string;
  larmkoordinat_kalla: string | null;
  /** objektets nummer NU (kan skilja sig från leveransens när träffen kom via extra nummer) */
  vo_nummer: string | null;
  via: 'vo_nummer' | 'extra_nummer';
  /** hela raden som den ser ut nu (select *) — omimporten jämför varje fält mot den (se byggOmimportPatch) */
  rad: Record<string, any>;
}

export type BefintligtSvar =
  | { typ: 'traff'; objekt: BefintligtObjekt }
  | { typ: 'ingen' }
  | { typ: 'fel'; fel: string };

const tabellSaknas = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|schema cache/i.test(String(e.message ?? '')));

export async function hittaBefintligtObjekt(supabase: SupabaseClient, voNummer: string | null | undefined): Promise<BefintligtSvar> {
  const vo = String(voNummer ?? '').trim();
  if (!vo) return { typ: 'ingen' };

  const { data: rader, error } = await supabase.from('objekt').select('*').eq('vo_nummer', vo).limit(1);
  if (error) return { typ: 'fel', fel: `Kunde inte slå upp objektet på vo_nummer: ${error.message}` };
  if (rader && rader[0]) return { typ: 'traff', objekt: { ...(rader[0] as any), via: 'vo_nummer', rad: rader[0] as any } };

  // Extra nummer gäller kontraktsnummer (siffror); ett P-VO eller annat icke-numeriskt nummer kan inte vara ett.
  if (!/^\d+$/.test(vo)) return { typ: 'ingen' };
  const { data: alias, error: aliasFel } = await supabase.from('objekt_alt_nummer').select('objekt_id').eq('nummer', vo).is('maskin_id', null).limit(1);
  if (aliasFel) {
    if (tabellSaknas(aliasFel)) return { typ: 'ingen' };
    return { typ: 'fel', fel: `Kunde inte slå upp extra nummer: ${aliasFel.message}` };
  }
  const objektId = (alias?.[0] as { objekt_id?: string } | undefined)?.objekt_id;
  if (!objektId) return { typ: 'ingen' };
  const { data: obj, error: objFel } = await supabase.from('objekt').select('*').eq('id', objektId).limit(1);
  if (objFel) return { typ: 'fel', fel: `Kunde inte läsa objektet för extra nummer ${vo}: ${objFel.message}` };
  if (!obj || !obj[0]) return { typ: 'ingen' };
  return { typ: 'traff', objekt: { ...(obj[0] as any), via: 'extra_nummer', rad: obj[0] as any } };
}

// === Omimport: skriv bara över det importen själv har satt ===
//
// Förut skrevs allt utom SKYDDADE över vid varje ny leverans — också det Martin rättat för hand i /objekt eller Redigering (åtgärd,
// typ, avverkningsform, volym, inköpare …). Nu gäller per fält:
//   1. Leveransen har inget värde (null, tom text, tom lista; 0 för volym/areal)          -> rör inte fältet (som förut).
//   2. Fältet i databasen är tomt                                                         -> skriv.
//   3. Fältet har exakt det värde förra importen satte (objekt.import_varden[fält])        -> skriv (ingen har ändrat det).
//   4. Fältet har samma värde som leveransen nu ger                                       -> inget att skriva; värdet noteras som importens.
//   5. Annars (någon har ändrat det, eller så är ursprunget okänt) -> BEHÅLL. Fältet listas i `behollna` så importen kan säga det.
//
// `import_varden` är en jsonb på objekt: {fält: värde importen senast satte}. Rader som importerades före kolumnen finns saknar den;
// där går det inte att se vem som satte ett icke-tomt värde, och då vinner det som står (regel 5) — hellre ett inaktuellt värde än
// en tyst förlorad rättning. Regel 4 gör att raden "lär sig" snabbt: fält som stämmer med leveransen räknas som importens.
//
// Larmkoordinaten (larmkoordinat_*) följer sin egen regel i routen: 'egen' eller bekräftad -> orörd, annars importens (som förut).
// Importägda artefakter (dokumentvägar, kartbild, checklista, `kalla`) skrivs alltid över: de är härledda ur filen, har deterministiska
// vägar och ingen redigerar dem för hand. Skulle de låsas av regel 5 fick omimporterade rader aldrig nya traktkartor.

/**
 * Kolumner som ALDRIG skrivs vid omimport. envz äger dem inte. Listan kommer växa — lägg nya manuella fält HÄR, inte som spridda specialfall.
 *   lat, lng            manuellt flyttade kartpinnar
 *   anteckningar        användartext (redigeras i /objekt)
 *   ar, manad, ordning  planering (envz har dem inte ändå — skydda ändå explicit)
 *   status              planeringsstatus (sätts av planeringsvyn)
 *   larmkoordinat_*     villkorat i routen (bevaras helt om kalla='egen' eller bekräftad)
 */
export const SKYDDADE_VID_OMIMPORT: readonly string[] = ['lat', 'lng', 'anteckningar', 'ar', 'manad', 'ordning', 'status'];

export const IMPORTAGDA_FALT: readonly string[] = [
  'kalla', 'import_varningar', 'checklist_items',
  'kartbild_url', 'kartbild_bounds', 'traktdirektiv_url', 'stamplingslangd_url', 'traktkarta_url', 'traktkartor',
  'oversiktskarta_url', 'valtlapp_url', 'ovriga_dokument',
];

/** Fält där 0 betyder "hittades inte i filen" (TD-parsern ger 0 när volymen saknas) — får aldrig skriva över ett riktigt värde. */
const NOLL_AR_SAKNAD = new Set(['volym', 'areal']);

const arTomText = (v: unknown) => typeof v === 'string' && v.trim() === '';

/** Leveransen har inget att säga om fältet. */
function ingetNyttVarde(k: string, v: unknown): boolean {
  if (v === null || v === undefined || arTomText(v)) return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (v === 0 && NOLL_AR_SAKNAD.has(k)) return true;
  return false;
}

/** Fältet i databasen är "tomt" — inget att skydda. false/0 räknas som tomt (kolumnernas grundvärden). */
function arTomt(v: unknown): boolean {
  return v === null || v === undefined || arTomText(v) || v === false || v === 0 || (Array.isArray(v) && v.length === 0);
}

function kanonisk(v: unknown): string {
  if (v === undefined || v === null) return 'null';
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(kanonisk).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + kanonisk(o[k])).join(',') + '}';
}

/** Samma värde? Tal och talsträngar ("3.64" / 3.64) räknas lika — numeric kan komma tillbaka i båda former. */
export function arLika(a: unknown, b: unknown): boolean {
  if (kanonisk(a) === kanonisk(b)) return true;
  const tal = (x: unknown) => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN);
  const x = tal(a), y = tal(b);
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
}

export interface OmimportOpt {
  skyddade: readonly string[];
  bevaraLarm: boolean;
  behallVoNummer: boolean;
  /** Objektraden som den ser ut nu (select *). */
  nuvarande: Record<string, any>;
  /** objekt.import_varden som den ser ut nu (null/saknas = raden importerades före kolumnen). */
  importVarden: Record<string, any> | null | undefined;
}

export interface OmimportResultat {
  patch: Record<string, any>;
  /** Fält där leveransen hade ett annat värde än raden, men raden lämnades orörd eftersom någon annan ändrat det (eller ursprunget är okänt). */
  behollna: string[];
  /** Nya objekt.import_varden: tidigare värden + det som skrevs/stämde den här gången. */
  importVarden: Record<string, any>;
}

/**
 * Det som skrivs vid omimport: skyddade kolumner, 'egen'/bekräftad larmkoordinat och tomma leveransvärden skrivs aldrig; träffade vi via
 * ett extra nummer (`behallVoNummer`) skrivs INTE leveransens vo_nummer. Resten följer reglerna ovan.
 */
export function byggOmimportPatch(data: Record<string, any>, opt: OmimportOpt): OmimportResultat {
  const patch: Record<string, any> = {};
  const behollna: string[] = [];
  const importVarden: Record<string, any> = { ...(opt.importVarden ?? {}) };
  const tidigare = opt.importVarden ?? {};

  for (const [k, v] of Object.entries(data)) {
    if (opt.skyddade.includes(k)) continue;                                  // aldrig vid omimport
    if (k === 'vo_nummer' && opt.behallVoNummer) continue;                   // objektets nummer lämnas orört (träff via extra nummer)
    if (k.startsWith('larmkoordinat_') && opt.bevaraLarm) continue;          // 'egen' / bekräftad -> orört
    if (ingetNyttVarde(k, v)) continue;                                      // nollar aldrig befintligt värde
    if (k === 'vo_nummer' || k.startsWith('larmkoordinat_') || IMPORTAGDA_FALT.includes(k)) { patch[k] = v; continue; }   // larm: bevarad ovan om egen/bekräftad, annars importens

    const nu = opt.nuvarande[k];
    if (arLika(nu, v)) { importVarden[k] = v; continue; }                    // stämmer redan: inget att skriva, värdet är importens
    if (arTomt(nu) || (k in tidigare && arLika(nu, tidigare[k]))) {          // tomt, eller orört sedan förra importen
      patch[k] = v;
      importVarden[k] = v;
      continue;
    }
    behollna.push(k);                                                        // någon annan äger värdet nu
  }
  return { patch, behollna, importVarden };
}

/**
 * `import_varden` för ett NYTT objekt (INSERT): allt importen skriver och som en omimport senare får skriva över — alltså inte de
 * skyddade fälten, vo_nummer (matchningsnyckeln), importägda artefakter eller tomma värden. Samma urval som byggOmimportPatch gör.
 */
export function importVardenForNyttObjekt(data: Record<string, any>): Record<string, any> {
  const ut: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (SKYDDADE_VID_OMIMPORT.includes(k) || k === 'vo_nummer' || k === 'import_varden' || k.startsWith('larmkoordinat_') || IMPORTAGDA_FALT.includes(k)) continue;
    if (ingetNyttVarde(k, v)) continue;
    ut[k] = v;
  }
  return ut;
}
