// Sammanfattningen — räknad i SQL, läst här.
//
// VARFÖR INTE I FRONTEND
// Spridningen mellan punkter är kvalitetsmåttet: den säger om mätningen går
// att lita på eller om någon punkt är feltagen. Räknas den i JavaScript kan
// två vyer komma fram till olika svar om samma mätning — en använder
// stickprovsformeln, en annan populationsformeln, en tredje glömmer att
// utesluta ofullständiga varv. Vyerna i databasen är EN definition.
//
// Se 20260826_matning_objekt_uuid_och_vyer.sql. Vyerna är
// security_invoker, så RLS på de underliggande tabellerna gäller — en vy ska
// inte vara en bakdörr.

import { supabase } from '../supabase';

export type Sammanfattning = {
  matning_id: string;
  objekt_uuid: string;
  datum: string;
  relaskop_faktor: number;
  punkter_totalt: number;
  punkter_slutna: number;
  punkter_ofullstandiga: number;
  /** null när inga slutna punkter finns — inte 0. */
  medel_grundyta: number | null;
  /** null vid färre än två punkter. Spridning kräver minst två mätvärden. */
  spridning: number | null;
  lagsta: number | null;
  hogsta: number | null;
};

export type TradslagRad = {
  tradslag: string;
  antal_trad: number;
  grundyta_m2_per_ha: number;
  andel_pct: number;
};

export type PunktRad = {
  punkt_nummer: number;
  antal_trad: number;
  grundyta_m2_per_ha: number;
  varv_slutet: boolean;
  varv_grader: number | null;
};

export type SammanfattningResultat =
  | { status: 'ok'; sammanfattning: Sammanfattning; tradslag: TradslagRad[]; punkter: PunktRad[] }
  | { status: 'vyer_saknas' }
  | { status: 'tom' }
  | { status: 'fel'; meddelande: string };

/** PostgREST säger 42P01 när relationen inte finns, och PGRST205 när den inte
 *  ligger i schema-cachen. Båda betyder samma sak för användaren: migrationen
 *  är inte körd. Det ska SÄGAS, inte se ut som en tom mätning. */
function vySaknas(kod?: string, meddelande?: string): boolean {
  if (kod === '42P01' || kod === 'PGRST205') return true;
  return !!meddelande && /does not exist|schema cache/i.test(meddelande);
}

export async function hamtaSammanfattning(matningId: string): Promise<SammanfattningResultat> {
  const s = await supabase
    .from('matning_sammanfattning')
    .select('*')
    .eq('matning_id', matningId)
    .maybeSingle();
  if (s.error) {
    return vySaknas(s.error.code, s.error.message)
      ? { status: 'vyer_saknas' }
      : { status: 'fel', meddelande: s.error.message };
  }
  if (!s.data) return { status: 'tom' };

  const [t, p] = await Promise.all([
    supabase.from('matning_tradslag').select('*').eq('matning_id', matningId).order('antal_trad', { ascending: false }),
    supabase.from('matning_punkt_grundyta').select('*').eq('matning_id', matningId).order('punkt_nummer'),
  ]);
  if (t.error) return { status: 'fel', meddelande: t.error.message };
  if (p.error) return { status: 'fel', meddelande: p.error.message };

  return {
    status: 'ok',
    sammanfattning: s.data as Sammanfattning,
    tradslag: (t.data ?? []) as TradslagRad[],
    punkter: (p.data ?? []) as PunktRad[],
  };
}

/** Senaste mätningen för en trakt, om någon finns. */
export async function senasteMatning(objektUuid: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('matning')
    .select('id')
    .eq('objekt_uuid', objektUuid)
    .order('datum', { ascending: false })
    .order('skapad', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data?.id as string) ?? null;
}

/**
 * Hur spridningen ska läsas, i ord.
 *
 * Variationskoefficienten (spridning delat med medel) säger mer än
 * standardavvikelsen ensam: 4 m²/ha spridning är mycket kring ett medel på 12
 * och lite kring ett medel på 30. Trösklarna är trubbiga med flit — de ska
 * skilja "det här går att lita på" från "gå ut och mät fler punkter", inte
 * gradera i decimaler.
 *
 * Under två slutna punkter finns ingen spridning att tala om, och då sägs det
 * i stället för att visa en nolla som ser lugnande ut.
 */
export function spridningsText(s: Sammanfattning): string {
  if (s.punkter_slutna < 2) return 'För få punkter för att säga något om spridningen';
  if (s.spridning == null || s.medel_grundyta == null || s.medel_grundyta <= 0) {
    return 'Spridningen kunde inte räknas';
  }
  const kv = s.spridning / s.medel_grundyta;
  if (kv < 0.15) return 'Jämnt bestånd — punkterna ligger nära varandra';
  if (kv < 0.30) return 'Normal variation för en gallring';
  return 'Stor spridning — beståndet varierar, eller så är någon punkt feltagen';
}
