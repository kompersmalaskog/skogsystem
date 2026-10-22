// Objektöversiktens läsning. Ett läsfel är ett fel (med vad som inte gick att läsa), aldrig en tom lista eller en
// nolla som ser ut som "ingen tid". Allt pagineras (PostgREST kapar tyst vid 1000 rader).

import { hamtaAlla } from '@/lib/supabaseAlla';
import { objektIds, type ObjektRad, type ProdRad, type Underlag } from './berakna';

type Klient = { from: (t: string) => any };

export const OBJEKT_KOLUMNER = [
  'id', 'namn', 'vo_nummer', 'dim_objekt_id', 'status', 'typ', 'bolag', 'markagare', 'volym', 'areal', 'manuell_prognos',
  'avslutad_timestamp', 'pagaende_startad_timestamp', 'barighet', 'terrang', 'skotningsavstand', 'skordare_band', 'skotare_band',
  'skotare_extra_vagn', 'skotare_lastreder_breddat', 'transport_trailer_in', 'skordare_manuell_fallning',
  'skordare_manuell_fallning_text', 'cert', 'anteckningar', 'forardirektiv', 'info_anteckningar', 'markagare_ska_ha_ved',
  'markagare_ved_text', 'grot', 'grot_status', 'skordare_maskin_id', 'skotare_maskin_id', 'medelstam',
].join(', ');

export type LasSvar = { underlag: Underlag; fel: null } | { underlag: null; fel: string };

export async function lasUnderlag(sb: Klient): Promise<LasSvar> {
  const [objekt, dim, alt, tid, manuell, extra, flytt, maskiner, platser, medarbetare] = await Promise.all([
    hamtaAlla(() => sb.from('objekt').select(OBJEKT_KOLUMNER), 'id'),
    hamtaAlla(() => sb.from('dim_objekt').select('objekt_id, vo_nummer, skordning_avslutad, skotning_avslutad, egen_skotning, grot_hamtad'), 'objekt_id'),
    hamtaAlla(() => sb.from('objekt_alt_nummer').select('id, objekt_id, nummer, maskin_id'), 'id'),
    hamtaAlla(() => sb.from('fakt_tid').select('id, datum, maskin_id, objekt_id, processing_sek, terrain_sek, other_work_sek, bransle_liter'), 'id'),
    hamtaAlla(() => sb.from('skotare_objekt_manuell').select('id, objekt_id, maskin_id, g15_timmar'), 'id'),
    hamtaAlla(() => sb.from('extra_tid').select('id, datum, minuter, aktivitet_typ, objekt_id, medarbetare_id').not('objekt_id', 'is', null), 'id'),
    hamtaAlla(() => sb.from('maskin_flytt').select('id, maskin_id, extern_maskin, till_objekt_id, fran_objekt_id, fran_plats_id, starttid, sluttid, hamtad_tid, avbruten, tid_flytt_min, flytt_km'), 'id'),
    hamtaAlla(() => sb.from('dim_maskin').select('maskin_id, visningsnamn, maskin_typ'), 'maskin_id'),
    hamtaAlla(() => sb.from('flyttplats').select('id, namn'), 'id'),
    hamtaAlla(() => sb.from('medarbetare').select('id, namn'), 'id'),
  ]);
  const fel: [string, { error: any }][] = [
    ['objekten', objekt], ['objektens nummer', dim], ['objektens extra nummer', alt], ['maskintiden', tid],
    ['den manuella skotningen', manuell], ['den extra tiden', extra], ['flyttarna', flytt], ['maskinerna', maskiner],
    ['flyttplatserna', platser], ['medarbetarna', medarbetare],
  ];
  for (const [vad, svar] of fel) {
    if (svar.error) {
      console.error('[objektoversikt] läsfel', vad, svar.error);
      return { underlag: null, fel: vad };
    }
  }
  return {
    fel: null,
    underlag: {
      objekt: objekt.data, dim: dim.data, alt: alt.data, tid: tid.data, manuell: manuell.data, extra: extra.data,
      flytt: flytt.data, maskiner: maskiner.data, platser: platser.data, medarbetare: medarbetare.data,
    },
  };
}

/** Skördarens produktion under objektets nummer (läses per objekt, separat från tiden — aldrig en join). */
export async function lasProduktion(sb: Klient, o: ObjektRad, u: Underlag): Promise<{ data: ProdRad[]; error: any }> {
  const ids = [...objektIds(o, u.dim, u.alt)];
  if (ids.length === 0) return { data: [], error: null };
  return hamtaAlla<ProdRad>(() => sb.from('fakt_produktion').select('id, objekt_id, maskin_id, volym_m3sub, stammar').in('objekt_id', ids), 'id');
}
