'use client';
// Skörd/skotat per objekt (nyckel = vo_nummer) för /oversikt-v2.
//
// SAMMA regel som gamla /oversikt (page.tsx FAS B) och lib/skotat — men en egen,
// avskalad kopia så att gamla /oversikt inte behöver röras. Bär bara det v2 behöver:
//   • "kvar på backen"  (skördat − skotat, egen skotning = 0)
//   • "avverkat" + liggetid  (sista skörddatum)
//   • backen-pålitlighet till lib/nastaObjekt (skotat != null ⇒ vi har skotdata att lita på)
//
// skotat = null (okänt, ≠ 0): ingen lass OCH ingen manuell registrering. Det är en
// annan sak än "0 utkört" och foreslaNasta behandlar det som ovisst (se memory).

import { supabase } from '@/lib/supabase';
import { objektSkotat, type SkotareManuellRad } from '@/lib/skotat';

export interface SkordAggV2 {
  skordat: number;          // m³fub (vy_uppf_prod_per_objekt)
  skotat: number | null;    // m³fub — null = ingen skotdata registrerad (≠ 0)
  sista: string | null;     // sista skörddatum → "avverkat" + liggetid
  lassSista: string | null; // sista lass-datum (skotarens aktivitet)
  egenSkotning: boolean;    // säljaren/markägaren skotar själv → aldrig vårt skotarjobb
}

/** Paginerad hämtning — .order() KRÄVS för stabil sidbrytning över 1000-radsgränsen. */
async function fetchAllRows<T>(query: () => any): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await query().range(offset, offset + PAGE - 1);
    if (error) throw error; // ärligt fel — anroparen degraderar mjukt (aldrig tyst [])
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

/**
 * Skörd/skotat per vo_nummer. Kastar vid läsfel (anroparen fångar och visar "–"
 * i arket i stället för fel siffror). Samma källor och samma EN-regel som /oversikt.
 */
export async function hamtaSkordMapV2(): Promise<Record<string, SkordAggV2>> {
  const [skordRows, lassRows, skotRows, manuellRows, dimRows] = await Promise.all([
    fetchAllRows<{ objekt_id: string; volym_m3sub: number; sista_datum: string }>(
      () => supabase.from('vy_uppf_prod_per_objekt').select('objekt_id, volym_m3sub, sista_datum').order('objekt_id')),
    fetchAllRows<{ objekt_id: string; volym_m3sub: number; maskin_id: string | null }>(
      () => supabase.from('fakt_lass').select('objekt_id, volym_m3sub, maskin_id').order('objekt_id')),
    fetchAllRows<{ objekt_id: string; sista_datum: string | null }>(
      () => supabase.from('vy_uppf_lass_per_objekt').select('objekt_id, sista_datum').order('objekt_id')),
    fetchAllRows<{ objekt_id: string; maskin_id: string | null; volym_m3: number | null; volym_egen_skotning: number | null; volym_omlastning: number | null; ar_omlastning: boolean | null }>(
      () => supabase.from('skotare_objekt_manuell').select('objekt_id, maskin_id, volym_m3, volym_egen_skotning, volym_omlastning, ar_omlastning').order('objekt_id')),
    fetchAllRows<{ vo_nummer: string; egen_skotning: boolean | null }>(
      () => supabase.from('dim_objekt').select('vo_nummer, egen_skotning').order('vo_nummer')),
  ]);

  const map: Record<string, SkordAggV2> = {};
  const ensure = (k: string): SkordAggV2 =>
    (map[k] ||= { skordat: 0, skotat: null, sista: null, lassSista: null, egenSkotning: false });

  for (const r of skordRows) {
    if (!r.objekt_id) continue;
    const m = ensure(String(r.objekt_id));
    m.skordat = r.volym_m3sub || 0;
    m.sista = r.sista_datum || null;
  }
  for (const r of skotRows) {
    if (!r.objekt_id) continue;
    ensure(String(r.objekt_id)).lassSista = r.sista_datum || null;
  }

  // Per-maskin lass (fakt_lass) — EN-regeln i lib/skotat kräver per maskin (manuell trumfar
  // den maskinens lass, aldrig dubbelräkning). Lass utan maskin_id → sentinel så totalen bevaras.
  const lassPM: Record<string, Map<string, number>> = {};
  for (const r of lassRows) {
    if (!r.objekt_id) continue;
    const k = String(r.objekt_id);
    const mid = r.maskin_id || '__ingen__';
    (lassPM[k] ||= new Map()).set(mid, (lassPM[k].get(mid) || 0) + (r.volym_m3sub || 0));
  }

  // Manuell: objekt-nivå (maskin_id NULL = trumfar allt) + per maskin (EGEN/OMLASTNING via EN-regeln)
  const manNiva: Record<string, number> = {};
  const manPM: Record<string, Map<string, SkotareManuellRad>> = {};
  for (const r of manuellRows) {
    if (!r.objekt_id) continue;
    const k = String(r.objekt_id);
    if (r.maskin_id == null) {
      if (r.volym_m3 == null) continue;
      const v = Number(r.volym_m3) || 0;
      manNiva[k] = k in manNiva ? Math.max(manNiva[k], v) : v;
    } else {
      (manPM[k] ||= new Map()).set(r.maskin_id, r as SkotareManuellRad);
    }
  }
  const skotKeys = Array.from(new Set<string>([...Object.keys(lassPM), ...Object.keys(manNiva), ...Object.keys(manPM)]));
  for (const k of skotKeys) {
    const m = ensure(k);
    const niva = k in manNiva ? manNiva[k] : null;
    const res = objektSkotat({
      lassPerMaskin: lassPM[k] || new Map<string, number>(),
      manuellRadPerMaskin: manPM[k] || new Map<string, SkotareManuellRad>(),
      manuellObjektNiva: niva,
    });
    m.skotat = res.skotat;
  }

  for (const r of dimRows) {
    if (r.vo_nummer && r.egen_skotning === true) ensure(r.vo_nummer).egenSkotning = true;
  }

  return map;
}
