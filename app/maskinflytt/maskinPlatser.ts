// Var står maskinerna? — läsningen för Översikten och Planeringens maskinprickar. EN källa, så en maskin aldrig står på olika
// ställen i två vyer (regeln: lib/maskinPlats.ts). senastePlats (flytt, GPS-fix vid flytt, produktion) slås ihop med appens GPS i
// hytten (RPC maskin_senaste_position). Lastbilens "Hämta en maskin" har sin egen, likadana jämförelse och rörs inte.
//
// Går GPS:en inte att läsa står platserna kvar (det är ett delfel, aldrig "ingen position") och felet följer med i delvisFel.

import { supabase } from '@/lib/supabase';
import { slaIhopMedGps } from '@/lib/maskinPlats';
import type { MaskinPosRad } from '@/lib/maskinerNu';
import { hamtaSenastePlatser, type PlatsForslag } from './senastePlats';

export async function hamtaMaskinPlatser(maskinIds: string[]): Promise<{ platser: Map<string, PlatsForslag>; fel: string | null; delvisFel: string | null }> {
  const [plats, gps] = await Promise.all([
    hamtaSenastePlatser(maskinIds),
    (async () => { try { return await supabase.rpc('maskin_senaste_position'); } catch (e) { return { data: null, error: e as { message?: string } }; } })(),
  ]);
  if (plats.fel) return plats;
  if (gps.error || !Array.isArray(gps.data)) {
    const msg = (gps.error as { message?: string } | null)?.message ?? 'okänt fel';
    return { ...plats, delvisFel: [plats.delvisFel, `GPS i hytten kunde inte läsas: ${msg}`].filter(Boolean).join(' · ') };
  }
  const bara = new Set(maskinIds);
  const rader = (gps.data as MaskinPosRad[]).filter((r) => bara.has(r.maskin_id));
  return { ...plats, platser: slaIhopMedGps(plats.platser, rader) as Map<string, PlatsForslag> };
}
