// Läsning och skrivning för Objekt-vyn (objekt + beställningar i EN vy). Ett läsfel är ett fel — aldrig en tom lista som ser ut som
// "inga objekt" (CLAUDE.md, ärlig data). Skrivningar kräver rader tillbaka: noll rader är ett fel, inte "sparat".
import { supabase } from '@/lib/supabase';
import { bekraftadRad, type Osakert } from './filenGav';
import type { Manad } from './manad';
import type { ObjektTyp } from './tackning';

export interface ObjektRad {
  id: string;
  namn: string;
  typ: string | null;
  bolag: string | null;
  ar: number | null;
  manad: number | null;
  volym: number | null;
  status: string | null;
  traktdirektiv_url: string | null;
  stamplingslangd_url: string | null;
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

const LISTKOLUMNER = 'id, namn, typ, bolag, ar, manad, volym, status, traktdirektiv_url, stamplingslangd_url, import_varningar';

/** Objekt av de två typerna med beställning för månaden. Avslutade ingår: volymen står kvar. */
export async function hamtaObjektForManad(m: Manad): Promise<ObjektRad[]> {
  const { data, error } = await supabase
    .from('objekt')
    .select(LISTKOLUMNER)
    .eq('ar', m.ar)
    .eq('manad', m.manad)
    .in('typ', ['gallring', 'slutavverkning'])
    .order('ordning', { ascending: true })
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
export async function laggInObjekt(o: { namn: string; volym: number; typ: ObjektTyp; bolag: string } & Manad): Promise<void> {
  const { data, error } = await supabase
    .from('objekt')
    .insert({ namn: o.namn.trim(), volym: Math.round(o.volym), typ: o.typ, bolag: o.bolag, ar: o.ar, manad: o.manad, kalla: 'manuell' })
    .select('id');
  if (error) throw new Error(error.message);
  if ((data ?? []).length !== 1) throw new Error('Objektet sparades inte. Försök igen.');
}

/**
 * "Ja, det stämmer": importens OSÄKER-rad ersätts med en Bekräftad-rad i `import_varningar`. Är filen en okänd PDF
 * (inte redan stämplingslängd) flyttas den dessutom till stämplingslängd och tas bort ur övriga dokument.
 * En omimport skriver om `import_varningar` och frågan kommer tillbaka — importen bevarar inget av det här.
 */
export async function bekraftaStamplingslangd(objektId: string, osakert: Osakert, fil: { path: string | null }): Promise<void> {
  const { data: rad, error: lasFel } = await supabase.from('objekt').select('import_varningar, ovriga_dokument, stamplingslangd_url').eq('id', objektId).maybeSingle();
  if (lasFel) throw new Error(lasFel.message);
  if (!rad) throw new Error('Objektet finns inte längre.');
  const varningar: string[] = Array.isArray(rad.import_varningar) ? rad.import_varningar.filter((v: unknown): v is string => typeof v === 'string') : [];
  const patch: Record<string, unknown> = {
    import_varningar: varningar.map(v => (v === osakert.rad ? bekraftadRad(osakert.fil) : v)),
  };
  if (osakert.slag === 'okand_pdf') {
    if (!fil.path) throw new Error('Filen hittades inte bland objektets dokument.');
    patch.stamplingslangd_url = fil.path;
    patch.ovriga_dokument = (Array.isArray(rad.ovriga_dokument) ? rad.ovriga_dokument : []).filter((d: { path?: string }) => d.path !== fil.path);
  }
  const { data, error } = await supabase.from('objekt').update(patch).eq('id', objektId).select('id');
  if (error) throw new Error(error.message);
  if ((data ?? []).length !== 1) throw new Error('Ändringen sparades inte. Försök igen.');
}
