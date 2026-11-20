// Läser lass direkt ur servern utan att röra förarens lokala kö (lasLassForObjekt i koKopplad gör det, och ska inte användas av en
// vy som bara tittar — planeringsvyn, admin). Delas av granskningen (Datahälsa) och planeringsvyns hög-prickar (lib/skotarHogarKvar).
import { supabase } from '@/lib/supabase';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { LASS_SELECT, lassFranServer } from './server';
import type { Lass } from './typer';

/** Trakten alla lass ur servern, utan att röra den lokala kön. null = kunde inte läsas. */
export async function lasLassServer(objektId: string): Promise<Lass[] | null> {
  try {
    const r = await hamtaAlla<any>(() => supabase.from('skotar_lass').select(LASS_SELECT).eq('objekt_id', objektId) as any, 'id');
    if (r.error) return null;
    return r.data.map(lassFranServer).filter((l): l is Lass => !!l);
  } catch { return null; }
}
