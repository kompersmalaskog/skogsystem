// Läsning och skrivning för Objekt-vyn (objekt + beställningar i EN vy). Ett läsfel är ett fel — aldrig en tom lista som ser ut som
// "inga objekt" (CLAUDE.md, ärlig data). Skrivningar kräver rader tillbaka: noll rader är ett fel, inte "sparat".
import { supabase } from '@/lib/supabase';
import { hamtaAlla } from '@/lib/supabaseAlla';
import type { Manad } from './manad';
import type { ObjektTyp, SektionTyp } from './tackning';

export interface ObjektRad {
  id: string;
  vo_nummer?: string | null;
  /** Maskinernas utfall i m³fub (lib/objekt/utfall.ts). null = inget utfall under VO-numret; undefined = inte läst (läsfel eller inget VO-nummer). */
  utfall?: number | null;
  namn: string;
  typ: string | null;
  bolag: string | null;
  kalla: string | null;
  ar: number | null;
  manad: number | null;
  volym: number | null;
  areal: number | null;
  /** Stämplingslängdens tal, inskrivet av en människa (migration 20261020094926_objekt_stamplingslangd_tal, körd i prod 2026-10-20). Saknas kolumnerna är de undefined. */
  stamplingslangd_volym?: number | null;
  stamplingslangd_enhet?: string | null;
  /** Stämplingslängdens PDF (importen). */
  stamplingslangd_url?: string | null;
  /** Rp = rotpost, Au = avverkningsuppdrag (migration 20261014125836); fångas bara på nyimporterade objekt. Saknas kolumnen är den undefined. */
  avtalsform?: string | null;
  status: string | null;
  traktdirektiv_url: string | null;
  import_varningar: unknown;
}

export interface Post {
  id: string;
  ar: number;
  manad: number;
  typ: ObjektTyp;
  bolag: string;
  bolag_id: number | null;
  volym: number;
}

const LISTKOLUMNER_BAS = 'id, vo_nummer, namn, typ, bolag, kalla, ar, manad, volym, areal, status, traktdirektiv_url, stamplingslangd_url, import_varningar';
const STAMPLINGSKOLUMNER = 'stamplingslangd_volym, stamplingslangd_enhet, avtalsform';

/** Kolumnerna finns inte förrän migrationen `objekt_stamplingslangd_tal` körts: PostgREST svarar då 42703/PGRST204 på själva listan. */
const arKolumnSaknas = (e: { code?: string | null; message?: string | null } | null) =>
  !!e && (e.code === '42703' || e.code === 'PGRST204' || /(stamplingslangd_(volym|enhet)|avtalsform)/.test(String(e.message ?? '')));

/**
 * Listan läses med stämplingslängdens kolumner; saknas de (migrationen ej körd) läses den utan dem — listan får aldrig falla för ett tillägg.
 * Övriga fel är fel som förut.
 */
async function lasObjekt(bygg: (kolumner: string) => PromiseLike<{ data: unknown; error: { code?: string | null; message?: string | null } | null }>): Promise<ObjektRad[]> {
  let r = await bygg(`${LISTKOLUMNER_BAS}, ${STAMPLINGSKOLUMNER}`);
  if (r.error && arKolumnSaknas(r.error)) r = await bygg(LISTKOLUMNER_BAS);
  if (r.error) throw new Error(r.error.message ?? 'Okänt fel');
  return medUtfall((r.data ?? []) as ObjektRad[]);
}

/**
 * Utfall per VO-nummer: SUM(fakt_produktion.volym_m3sub), m³fub. fakt_produktion har många rader per objekt (dag × trädslag × operator), så alla
 * sidor läses. Ett nummer utan rader finns inte i svaret (inget utfall — inte 0). Ett läsfel kastas: en halv summa vore sämre än ingen.
 */
export async function hamtaUtfall(voNummer: readonly string[]): Promise<Map<string, number>> {
  const vo = Array.from(new Set(voNummer.filter(v => v && v.trim() !== '')));
  const ut = new Map<string, number>();
  if (vo.length === 0) return ut;
  const { data, error } = await hamtaAlla<{ id: number; objekt_id: string; volym_m3sub: number | null }>(
    () => supabase.from('fakt_produktion').select('id, objekt_id, volym_m3sub').in('objekt_id', vo) as any,
    'id',
  );
  if (error) throw new Error(error.message ?? 'Utfallet kunde inte läsas');
  for (const r of data) ut.set(r.objekt_id, (ut.get(r.objekt_id) ?? 0) + (Number(r.volym_m3sub) || 0));
  return ut;
}

/** Listan får sitt utfall ur ett enda extra anrop. Går det inte att läsa visas listan ändå (utfallet är ett tillägg): raderna får inget utfall och ingen jämförelse görs. */
async function medUtfall(rader: ObjektRad[]): Promise<ObjektRad[]> {
  try {
    const u = await hamtaUtfall(rader.map(r => r.vo_nummer ?? ''));
    return rader.map(r => (r.vo_nummer ? { ...r, utfall: u.get(r.vo_nummer) ?? null } : r));
  } catch {
    return rader;
  }
}

/** Månadens objekt: gallring och slutavverkning (har beställning) och GROT (har ingen). Avslutade ingår: volymen står kvar. */
export async function hamtaObjektForManad(m: Manad): Promise<ObjektRad[]> {
  return lasObjekt(k => supabase
    .from('objekt')
    .select(k)
    .eq('ar', m.ar)
    .eq('manad', m.manad)
    .in('typ', ['gallring', 'slutavverkning', 'grot'])
    .order('ordning', { ascending: true })
    .order('namn', { ascending: true }));
}

/**
 * De levande objekten som saknar månad (Starta jobb lägger dem så). Avslutade utan månad räknas inte hit: de har aldrig räknats mot någon
 * beställning och är en egen fråga. De syns sist i vyn så att de inte döljs.
 */
export async function hamtaUtanManad(): Promise<ObjektRad[]> {
  return lasObjekt(k => supabase
    .from('objekt')
    .select(k)
    .or('ar.is.null,manad.is.null')
    .neq('status', 'avslutat')
    .order('namn', { ascending: true }));
}

/** Månadens poster, och — om `tom` — alla poster från och med månaden (förslaget behöver se vilka månader som redan är inlagda). */
export async function hamtaPoster(fran: Manad, tillOchMed?: Manad): Promise<Post[]> {
  let q = supabase.from('bestallningar').select('id, ar, manad, typ, bolag, bolag_id, volym');
  if (!tillOchMed) q = q.eq('ar', fran.ar).eq('manad', fran.manad);
  else q = q.gte('ar', fran.ar).lte('ar', tillOchMed.ar);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rader = (data ?? []) as Post[];
  if (!tillOchMed) return rader;
  const nyckel = (r: { ar: number; manad: number }) => r.ar * 12 + r.manad;
  return rader.filter(r => nyckel(r) >= nyckel(fran) && nyckel(r) <= nyckel(tillOchMed));
}

export interface NyPost { ar: number; manad: number; typ: ObjektTyp; bolag: string; bolag_id: number | null; volym: number }

/** Skriver beställningar med nyckeln (ar, manad, bolag, typ) — samma som tabellens unika index. Kräver att alla rader kom tillbaka. */
export async function sparaPoster(poster: NyPost[]): Promise<void> {
  if (poster.length === 0) return;
  const nu = new Date().toISOString();
  const { data, error } = await supabase
    .from('bestallningar')
    .upsert(poster.map(p => ({ ...p, uppdaterad_at: nu })), { onConflict: 'ar,manad,bolag,typ' })
    .select('id');
  if (error) throw new Error(error.message);
  if ((data ?? []).length !== poster.length) throw new Error('Beställningen sparades inte. Försök igen.');
}

/** Bolaget en ny beställning får när månaden inte har någon: det senast inlagda. Finns ingen alls: Vida. */
export async function standardBolag(): Promise<{ bolag: string; bolag_id: number | null }> {
  const { data, error } = await supabase.from('bestallningar').select('bolag, bolag_id').order('ar', { ascending: false }).order('manad', { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  const r = (data ?? [])[0] as { bolag: string; bolag_id: number | null } | undefined;
  return r ? { bolag: r.bolag, bolag_id: r.bolag_id } : { bolag: 'Vida', bolag_id: 1 };
}

/**
 * Ett objekt lagt in för hand. Typ, år och månad sätts av vyn. Status utelämnas medvetet: databasens default (`oplanerad`) gäller —
 * status styrs av planeringsvyn (Klar för maskin), aldrig här (objekt_status_check).
 */
export async function laggInObjekt(o: { namn: string; volym: number | null; typ: SektionTyp; bolag: string | null } & Manad): Promise<void> {
  const { data, error } = await supabase
    .from('objekt')
    .insert({ namn: o.namn.trim(), volym: o.volym == null ? null : Math.round(o.volym), typ: o.typ, bolag: o.bolag, ar: o.ar, manad: o.manad, kalla: 'manuell' })
    .select('id');
  if (error) throw new Error(error.message);
  if ((data ?? []).length !== 1) throw new Error('Objektet sparades inte. Försök igen.');
}

/** Flytta ett objekt till en annan månad. Rör ingenting annat (status och tilldelning styrs av planeringsvyn). */
export async function flyttaObjekt(objektId: string, till: Manad): Promise<void> {
  const { data, error } = await supabase.from('objekt').update({ ar: till.ar, manad: till.manad }).eq('id', objektId).select('id');
  if (error) throw new Error(error.message);
  if ((data ?? []).length !== 1) throw new Error('Objektet flyttades inte. Försök igen.');
}

/** Ta bort ett felimporterat objekt. Anroparen har redan fått en bekräftelse. Ett fel (t.ex. att något hänger ihop med objektet) visas som det är. */
export async function taBortObjekt(objektId: string): Promise<void> {
  const { data, error } = await supabase.from('objekt').delete().eq('id', objektId).select('id');
  if (error) throw new Error(error.message);
  if ((data ?? []).length !== 1) throw new Error('Objektet togs inte bort. Försök igen.');
}

/**
 * Rätta objektets volym (m³fub, heltal). Det inmätta talet från VO:n är det som räknas för en avslutad trakt — den här skrivningen är hur det
 * kommer in när Vida har levererat det. Rör ingenting annat. `import_varden` lämnas orört, så en omimport skriver inte över det rättade talet
 * (byggOmimportPatch skriver bara över ett fält som fortfarande har exakt värdet förra importen satte).
 */
export async function rattaVolym(objektId: string, volym: number): Promise<void> {
  if (!Number.isFinite(volym) || volym <= 0) throw new Error('Volymen måste vara ett positivt tal.');
  const { data, error } = await supabase.from('objekt').update({ volym: Math.round(volym) }).eq('id', objektId).select('id');
  if (error) throw new Error(error.message);
  if ((data ?? []).length !== 1) throw new Error('Volymen sparades inte. Försök igen.');
}

/** Stämplingslängdens tal med enhet, eller null/null för att ta bort det. Kräver migrationen `objekt_stamplingslangd_tal`: utan den säger felet det. */
export async function sparaStamplingslangd(objektId: string, tal: number | null, enhet: string | null): Promise<void> {
  if (tal != null && (!Number.isFinite(tal) || tal <= 0)) throw new Error('Talet måste vara positivt.');
  const { data, error } = await supabase
    .from('objekt')
    .update({ stamplingslangd_volym: tal, stamplingslangd_enhet: tal == null ? null : enhet })
    .eq('id', objektId)
    .select('id');
  if (error) {
    if (arKolumnSaknas(error)) throw new Error('Stämplingslängdens tal kan inte sparas än: databasen saknar fältet (migrationen objekt_stamplingslangd_tal är inte körd).');
    throw new Error(error.message);
  }
  if ((data ?? []).length !== 1) throw new Error('Talet sparades inte. Försök igen.');
}
