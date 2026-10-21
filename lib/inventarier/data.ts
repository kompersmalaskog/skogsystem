// Läsning och skrivning för inventarievyn. EN plats rör tabellerna.
//
// Antal, flytt, beställd och "Stämmer" går ALLTID via databasfunktionerna (inventarie_ta_ut, …): de skriver loggen och
// notisen kommer av triggern på raden. Att skapa en plats, artikel eller rad, och att ändra namn, hylla eller minnivå,
// går direkt mot tabellerna (RLS: alla inloggade).
//
// Ett fel är ett fel: läsningen kastar aldrig en tom lista som ser ut som "inget registrerat".

import { supabase } from '@/lib/supabase';
import type { Artikel, ArtikelTyp, Inventarier, InvRad, Maskin, Person, Plats, PlatsTyp } from './typer';

export async function lasInventarier(): Promise<Inventarier> {
  const [pl, ar, ra, ma, me] = await Promise.all([
    supabase.from('inventarie_plats').select('*').eq('aktiv', true),
    supabase.from('inventarie_artikel').select('*'),
    supabase.from('inventarie_rad').select('*'),
    supabase.from('dim_maskin').select('maskin_id, visningsnamn, maskin_typ, aktiv_till, sald'),
    // RLS: en förare läser bara sig själv, admin alla. Saknade namn är inget fel — "av Stefan" utelämnas då.
    supabase.from('medarbetare').select('id, namn').eq('aktiv', true),
  ]);
  const fel = pl.error || ar.error || ra.error || ma.error;
  if (fel) throw new Error(fel.message);
  const idag = new Date().toISOString().slice(0, 10);
  const maskiner: Maskin[] = ((ma.data as any[]) ?? []).map(m => ({
    maskin_id: m.maskin_id,
    visningsnamn: m.visningsnamn ?? null,
    maskin_typ: m.maskin_typ ?? null,
    aktiv: !m.sald && (!m.aktiv_till || m.aktiv_till >= idag),
  }));
  return {
    platser: (pl.data as Plats[]) ?? [],
    artiklar: (ar.data as Artikel[]) ?? [],
    rader: (ra.data as InvRad[]) ?? [],
    maskiner,
    personer: me.error ? [] : ((me.data as Person[]) ?? []),
  };
}

export type Svar<T = void> = { ok: true; varde: T } | { ok: false; fel: string };

/** Databasfunktionernas egna svenska fel visas som de är. */
function felText(e: { message?: string } | null | undefined): string {
  const m = e?.message?.trim();
  if (!m) return 'Det gick inte att spara. Försök igen.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Ingen kontakt. Försök igen när du har täckning.';
  return m;
}

async function rpc<T>(namn: string, args: Record<string, unknown>): Promise<Svar<T>> {
  try {
    const { data, error } = await supabase.rpc(namn, args);
    if (error) return { ok: false, fel: felText(error) };
    return { ok: true, varde: data as T };
  } catch (e: any) {
    return { ok: false, fel: felText(e) };
  }
}

export const taUt = (radId: string, antal = 1) => rpc<number>('inventarie_ta_ut', { p_rad_id: radId, p_antal: antal });
export const kommitIn = (radId: string, antal: number) => rpc<number>('inventarie_kommit_in', { p_rad_id: radId, p_antal: antal });
export const justera = (radId: string, nyttAntal: number) => rpc<number>('inventarie_justera', { p_rad_id: radId, p_nytt_antal: nyttAntal });
export const markeraBestalld = (radId: string, bestalld = true) => rpc<null>('inventarie_markera_bestalld', { p_rad_id: radId, p_bestalld: bestalld });
export const flytta = (radId: string, tillPlatsId: string) => rpc<string>('inventarie_flytta', { p_rad_id: radId, p_till_plats_id: tillPlatsId });
export const platsKollad = (platsId: string) => rpc<null>('inventarie_plats_kollad', { p_plats_id: platsId });

async function skriv<T>(fn: () => PromiseLike<{ data: any; error: any }>, plocka: (d: any) => T): Promise<Svar<T>> {
  try {
    const { data, error } = await fn();
    if (error) return { ok: false, fel: felText(error) };
    return { ok: true, varde: plocka(data) };
  } catch (e: any) {
    return { ok: false, fel: felText(e) };
  }
}

export type NyArtikel = {
  namn: string;
  typ: ArtikelTyp;
  maskin_id: string | null;
  sitter_pa: string | null;
  artikelnr: string | null;
  leverantor: string | null;
};

export function skapaArtikel(a: NyArtikel): Promise<Svar<Artikel>> {
  return skriv(() => supabase.from('inventarie_artikel').insert(a).select('*').single(), d => d as Artikel);
}

export type ArtikelAndring = Partial<Pick<Artikel, 'namn' | 'maskin_id' | 'sitter_pa' | 'artikelnr' | 'leverantor'>>;

export function andraArtikel(id: string, andring: ArtikelAndring): Promise<Svar<null>> {
  // Kräver en rad tillbaka: noll rader är ett fel, inte en lyckad sparning.
  return skriv(() => supabase.from('inventarie_artikel').update(andring).eq('id', id).select('id'), d => {
    if (!Array.isArray(d) || d.length === 0) throw new Error('Artikeln finns inte längre.');
    return null;
  });
}

export type NyRad = { artikel_id: string; plats_id: string; hylla: string | null; antal: number | null; min_antal: number | null };

export function skapaRad(r: NyRad): Promise<Svar<InvRad>> {
  return skriv(() => supabase.from('inventarie_rad').insert(r).select('*').single(), d => d as InvRad);
}

export type RadAndring = Partial<Pick<InvRad, 'hylla' | 'min_antal'>>;

export function andraRad(id: string, andring: RadAndring): Promise<Svar<null>> {
  return skriv(() => supabase.from('inventarie_rad').update({ ...andring, uppdaterad: new Date().toISOString() }).eq('id', id).select('id'), d => {
    if (!Array.isArray(d) || d.length === 0) throw new Error('Raden finns inte längre.');
    return null;
  });
}

export function taBortRad(id: string): Promise<Svar<null>> {
  return skriv(() => supabase.from('inventarie_rad').delete().eq('id', id).select('id'), d => {
    if (!Array.isArray(d) || d.length === 0) throw new Error('Raden finns inte längre.');
    return null;
  });
}

export type NyPlats = { namn: string; typ: PlatsTyp; maskin_id: string | null; ansvarig_medarbetare_id: string | null; ordning: number };

export function skapaPlats(p: NyPlats): Promise<Svar<Plats>> {
  return skriv(() => supabase.from('inventarie_plats').insert(p).select('*').single(), d => d as Plats);
}
