// Namn på maskiner, objekt och platser — EN väg för Körningar (rundornas ben) och Fakturering
// (kvittoraderna), så samma maskin och samma plats heter likadant överallt.
//
// Funktionerna KASTAR vid läsfel: den som anropar avgör om det blir ett fel för hela läsningen
// (aldrig en lista där hälften av namnen tyst saknas).

import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';

const CHUNK = 40;   // uuid:er i en in()-lista: håller adressen kort

export const chunka = <T,>(a: readonly T[], n: number = CHUNK): T[][] => {
  const ut: T[][] = [];
  for (let i = 0; i < a.length; i += n) ut.push(a.slice(i, i + n));
  return ut;
};
export const unika = (a: (string | null | undefined)[]): string[] => Array.from(new Set(a.filter((x): x is string => !!x)));

/** maskin_id → visningsnamn (alltid ur dim_maskin, aldrig maskiner.namn). */
export async function lasMaskinNamn(): Promise<Map<string, string>> {
  const m = await medAbortRetry(() => supabase.from('dim_maskin').select('maskin_id, visningsnamn, modell') as any);
  if (m.error) throw m.error;
  const kart = new Map<string, string>();
  for (const x of m.data ?? []) kart.set(x.maskin_id, x.visningsnamn || x.modell || x.maskin_id);
  return kart;
}

/** id → namn för bara de objekt eller platser som används. */
export async function lasPlatsNamn(tabell: 'objekt' | 'flyttplats', idn: string[]): Promise<Map<string, string>> {
  const kart = new Map<string, string>();
  for (const grupp of chunka(idn)) {
    const r = await medAbortRetry(() => supabase.from(tabell).select('id, namn').in('id', grupp) as any);
    if (r.error) throw r.error;
    for (const x of r.data ?? []) kart.set(x.id, x.namn);
  }
  return kart;
}
