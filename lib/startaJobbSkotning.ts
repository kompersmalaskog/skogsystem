// STARTA JOBB — ändra skotningen (Vi skotar / Egen skotning) på ett befintligt jobb. Bara admin (RLS: dim_objekt och objekt skrivs
// bara av admin för det här fältet).
//
// EN sanning: valet sparas på ALLA maskinobjekt som hör till numret (dim_objekt.egen_skotning — det fält Översikten och Redigering
// läser) OCH på jobbet (objekt.egen_skotning — finns innan någon maskin skickat data). Martin 2026-10-24: Trolleboda var egen skotning
// men maskinobjektet sa "vi skotar", så appen väntade på en skotare som aldrig kommer.
//
// Ordning: maskinobjekten först (det är dem resten av appen läser), sedan jobbet. Varje skrivning läses tillbaka; noll rader eller
// fel värde är ett fel — aldrig ett tyst "sparat".

import type { SupabaseClient } from '@supabase/supabase-js';

export interface SkotningMal {
  /** objekt.id; null = bara maskinobjekt (ingen planeringsrad) */
  jobbId: string | null;
  /** dim_objekt.objekt_id för alla maskinobjekt som hör till numret */
  dimIds: readonly string[];
}

export type SkotningSvar = { ok: true } | { ok: false; fel: string };

export async function sparaSkotning(supabase: SupabaseClient, mal: SkotningMal, egen: boolean): Promise<SkotningSvar> {
  const dimIds = Array.from(new Set(mal.dimIds.filter(Boolean)));
  if (!mal.jobbId && dimIds.length === 0) return { ok: false, fel: 'Det finns inget att spara på.' };

  if (dimIds.length) {
    const r = await supabase.from('dim_objekt').update({ egen_skotning: egen }).in('objekt_id', dimIds).select('objekt_id, egen_skotning');
    if (r.error) return { ok: false, fel: `Maskinobjekten kunde inte sparas: ${r.error.message}` };
    const rader = (r.data || []) as { objekt_id: string; egen_skotning: boolean | null }[];
    if (rader.length < dimIds.length || rader.some((x) => x.egen_skotning !== egen)) {
      return { ok: false, fel: `Maskinobjekten sparades inte (${rader.length} av ${dimIds.length}). Bara admin kan ändra skotningen.` };
    }
  }

  if (mal.jobbId) {
    const r = await supabase.from('objekt').update({ egen_skotning: egen }).eq('id', mal.jobbId).select('id, egen_skotning');
    if (r.error) {
      const saknas = /egen_skotning/.test(r.error.message || '');
      // Utan migrationen finns inte kolumnen på jobbet. Är maskinobjekten sparade gäller valet ändå där resten av appen läser.
      if (saknas && dimIds.length) return { ok: true };
      return { ok: false, fel: saknas ? 'Jobbet kan inte spara skotningen förrän databasen uppdaterats (migrationen objekt_egen_skotning).' : `Jobbet kunde inte sparas: ${r.error.message}` };
    }
    const rad = ((r.data || []) as { egen_skotning: boolean | null }[])[0];
    if (!rad || rad.egen_skotning !== egen) return { ok: false, fel: 'Jobbet sparades inte. Bara admin kan ändra skotningen.' };
  }
  return { ok: true };
}
