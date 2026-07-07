'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { buildUppfoljningData, buildEmptyData, type UppfoljningObjekt } from '../lib/transform';
import type { UppfoljningData } from '../UppfoljningVy';

export interface UseObjektUppfoljningResult {
  data: UppfoljningData | null;
  loading: boolean;
  error: Error | null;
}

export function useObjektUppfoljning(obj: UppfoljningObjekt): UseObjektUppfoljningResult {
  const [data, setData] = useState<UppfoljningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const skId = obj.skordareObjektId;
  const stId = obj.skotareObjektId;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const ids = [skId, stId].filter(Boolean) as string[];

        if (ids.length === 0) {
          if (!cancelled) {
            setData(buildEmptyData(obj));
            setLoading(false);
          }
          return;
        }

        const [tidRes, prodRes, sortRes, dimSortRes, dimTradslagRes, avbrottRes, lassRes, lassSortRes, dimOperatorRes, dimMaskinRes] = await Promise.all([
          supabase.from('fakt_tid').select('datum, objekt_id, maskin_id, operator_id, processing_sek, terrain_sek, other_work_sek, maintenance_sek, disturbance_sek, avbrott_sek, rast_sek, kort_stopp_sek, bransle_liter, engine_time_sek, tomgang_sek').in('objekt_id', ids),
          supabase.from('fakt_produktion').select('objekt_id, maskin_id, volym_m3sub, stammar, processtyp, tradslag_id, datum').in('objekt_id', ids),
          supabase.from('fakt_sortiment').select('objekt_id, sortiment_id, volym_m3sub, antal').in('objekt_id', ids),
          supabase.from('dim_sortiment').select('sortiment_id, namn'),
          supabase.from('dim_tradslag').select('tradslag_id, namn'),
          supabase.from('fakt_avbrott').select('objekt_id, maskin_id, typ, kategori_kod, langd_sek, datum').in('objekt_id', ids),
          stId ? supabase.from('fakt_lass').select('objekt_id, datum, volym_m3sub, korstracka_m').eq('objekt_id', stId) : Promise.resolve({ data: [] }),
          stId ? supabase.from('fakt_lass_sortiment').select('objekt_id, sortiment_id, sortiment_namn, volym_m3sub').eq('objekt_id', stId) : Promise.resolve({ data: [] }),
          supabase.from('dim_operator').select('operator_id, operator_namn, operator_key'),
          supabase.from('dim_maskin').select('maskin_id, maskin_typ'),
        ]);

        let avbrottRows: any[] = avbrottRes.data || [];

        // If objekt_id query missed avbrott for a machine, fetch by maskin_id as fallback
        const skMidFb = obj.skordareModellMaskinId;
        const stMidFb = obj.skotareModellMaskinId;
        const hasSkAvbrott = skMidFb ? avbrottRows.some((r: any) => r.maskin_id === skMidFb) : true;
        const hasStAvbrott = stMidFb ? avbrottRows.some((r: any) => r.maskin_id === stMidFb) : true;
        if (!hasSkAvbrott || !hasStAvbrott) {
          const fallbackQueries = [];
          if (!hasSkAvbrott && skMidFb) fallbackQueries.push(supabase.from('fakt_avbrott').select('objekt_id, maskin_id, typ, kategori_kod, langd_sek, datum').eq('maskin_id', skMidFb).limit(2000));
          if (!hasStAvbrott && stMidFb) fallbackQueries.push(supabase.from('fakt_avbrott').select('objekt_id, maskin_id, typ, kategori_kod, langd_sek, datum').eq('maskin_id', stMidFb).limit(2000));
          const fallbackResults = await Promise.all(fallbackQueries);
          for (const res of fallbackResults) {
            if (res.data) avbrottRows = [...avbrottRows, ...res.data];
          }
        }

        if (cancelled) return;

        setData(buildUppfoljningData({
          obj,
          tidRows: tidRes.data || [],
          prodRows: prodRes.data || [],
          sortRows: sortRes.data || [],
          lassRows: lassRes.data || [],
          lassSortRows: lassSortRes.data || [],
          avbrottRows,
          dimSort: dimSortRes.data || [],
          dimTradslag: dimTradslagRes.data || [],
          dimOperators: dimOperatorRes.data || [],
          dimMaskin: dimMaskinRes.data || [],
        }));
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setData(null);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skId, stId]);

  return { data, loading, error };
}
