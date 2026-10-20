// Läsning och skrivning för Objekt-vyn (objekt + beställningar i EN vy). Ett läsfel är ett fel — aldrig en tom lista som ser ut som
// "inga objekt" (CLAUDE.md, ärlig data). Skrivningar kräver rader tillbaka: noll rader är ett fel, inte "sparat".
import { supabase } from '@/lib/supabase';
import type { Manad } from './manad';
import type { ObjektTyp, SektionTyp } from './tackning';

export interface ObjektRad {
  id: string;
  namn: string;
  typ: string | null;
  bolag: string | null;
  kalla: string | null;
  ar: number | null;
  manad: number | null;
  volym: number | null;
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

const LISTKOLUMNER = 'id, namn, typ, bolag, kalla, ar, manad, volym, status, traktdirektiv_url, import_varningar';

/** Månadens objekt: gallring och slutavverkning (har beställning) och GROT (har ingen). Avslutade ingår: volymen står kvar. */
export async function hamtaObjektForManad(m: Manad): Promise<ObjektRad[]> {
  const { data, error } = await supabase
    .from('objekt')
    .select(LISTKOLUMNER)
    .eq('ar', m.ar)
    .eq('manad', m.manad)
    .in('typ', ['gallring', 'slutavverkning', 'grot'])
    .order('ordning', { ascending: true })
    .order('namn', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ObjektRad[];
}

/**
 * De levande objekten som saknar månad (Starta jobb lägger dem så). Avslutade utan månad räknas inte hit: de har aldrig räknats mot någon
 * beställning och är en egen fråga. De syns sist i vyn så att de inte döljs.
 */
export async function hamtaUtanManad(): Promise<ObjektRad[]> {
  const { data, error } = await supabase
    .from('objekt')
    .select(LISTKOLUMNER)
    .or('ar.is.null,manad.is.null')
    .neq('status', 'avslutat')
    .order('namn', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ObjektRad[];
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
