// Granskningen av de gamla självbekräftade lassen, kopplad till Supabase (admin, Datahälsa). Logiken bor i ./granskning, ./kvar och ./lassModell.
// Allt här LÄSER direkt från servern och rör aldrig förarens lokala kö (lasLassForObjekt i koKopplad gör det, och ska inte användas av en admin-vy).
import { supabase } from '@/lib/supabase';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { hamtaAltNummer, hogarObjektIds } from '@/lib/objektNummer';
import { granskArgument, type Granskning } from './granskning';
import { lasOptiLass, lasSkordat } from './koKopplad';
import { skotatMerAnSkordat, type SkotatMerAnSkordat } from './kvar';
import { LASS_SELECT, lassFranServer } from './server';
import type { Lass } from './typer';

/** Alla lass som den gamla självbekräftelsen satte och som inte är strukna. null = kunde inte läsas (aldrig en tom lista som ser ut som "inga"). */
export async function lasObekraftade(): Promise<Lass[] | null> {
  try {
    const r = await hamtaAlla<any>(() => supabase.from('skotar_lass').select(LASS_SELECT).eq('bekraftad_av', 'auto').neq('status', 'struket') as any, 'id');
    if (r.error) return null;
    return r.data.map(lassFranServer).filter((l): l is Lass => !!l);
  } catch { return null; }
}

/** Trakten alla lass ur servern, utan att röra den lokala kön. null = kunde inte läsas. */
export async function lasLassServer(objektId: string): Promise<Lass[] | null> {
  try {
    const r = await hamtaAlla<any>(() => supabase.from('skotar_lass').select(LASS_SELECT).eq('objekt_id', objektId) as any, 'id');
    if (r.error) return null;
    return r.data.map(lassFranServer).filter((l): l is Lass => !!l);
  } catch { return null; }
}

/**
 * Är mer skotat än skördat på trakten? Samma underlag som "kvar" i skotarläget (skördat, Opti-lass, appens lass som räknas).
 * `{ varning: null }` = nej. null = något av underlaget gick inte att läsa: hellre ingen rad än en gissning.
 */
export async function lasSkotatMerAnSkordat(objektId: string, voNummer: string | null): Promise<{ varning: SkotatMerAnSkordat | null } | null> {
  if (!voNummer) return null;
  const alt = await hamtaAltNummer(supabase, objektId);
  const ids = hogarObjektIds(voNummer, alt);
  const [lass, skordat, opti] = await Promise.all([lasLassServer(objektId), lasSkordat(voNummer, ids), lasOptiLass(voNummer, ids)]);
  if (!lass || !skordat || !opti) return null;
  return { varning: skotatMerAnSkordat(skordat, lass, opti) };
}

export type GranskSvar = { ok: true } | { ok: false; fel: string };

/** Bekräfta, stryk eller slå ihop. Databasfunktionen är allt eller inget och loggar före-tillståndet; felet från den visas som det är. */
export async function granskaLass(beslut: Granskning, lass: readonly Lass[], mal: string | null, anledning: string): Promise<GranskSvar> {
  try {
    const { error } = await supabase.rpc('skotar_lass_granska', granskArgument(beslut, lass, mal, anledning));
    if (!error) return { ok: true };
    // Funktionen finns först när migrationen är körd.
    if (error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(String(error.message))) {
      return { ok: false, fel: 'Granskningen är inte aktiverad än.' };
    }
    return { ok: false, fel: String(error.message ?? error) };
  } catch (e: any) {
    return { ok: false, fel: String(e?.message ?? e) };
  }
}
