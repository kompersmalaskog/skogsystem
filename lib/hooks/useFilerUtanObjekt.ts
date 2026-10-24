'use client';
// Läser det "Filer utan objekt" bygger på: HPR-filerna, planeringens objekt, extra nummer och ignorerade jobb.
// Samma läsning som OkopplFilerKort (en saknad tabell = migrationen ej körd = inga rader; allt annat fel är ett fel).

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { hamtaAlla } from '@/lib/supabaseAlla';
import type { AltNummerRad, HprFilRad, ObjektNamnRad } from '@/lib/objektNummer';

export interface FilerUtanObjektData { filer: HprFilRad[]; objekt: ObjektNamnRad[]; alias: AltNummerRad[]; ignorerade: Set<string> }

const tabellSaknas = (e: any) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|schema cache/i.test(String(e.message ?? '')));

export function useFilerUtanObjekt() {
  const [status, setStatus] = useState<'laddar' | 'ok' | 'fel'>('laddar');
  const [data, setData] = useState<FilerUtanObjektData>({ filer: [], objekt: [], alias: [], ignorerade: new Set() });

  const ladda = useCallback(async (): Promise<FilerUtanObjektData | null> => {
    const [f, o, a, ig] = await Promise.all([
      hamtaAlla<HprFilRad>(() => supabase.from('hpr_filer').select('filnamn, objekt_nyckel, fil_datum, tid_ar_utc, stammar_count'), 'id'),
      hamtaAlla<ObjektNamnRad>(() => supabase.from('objekt').select('id, namn, vo_nummer'), 'id'),
      hamtaAlla<AltNummerRad>(() => supabase.from('objekt_alt_nummer').select('id, objekt_id, nummer, maskin_id'), 'id'),
      hamtaAlla<{ nyckel: string }>(() => supabase.from('hpr_ignorerad').select('nyckel'), 'nyckel'),
    ]);
    const aSaknas = !!a.error && tabellSaknas(a.error);
    const igSaknas = !!ig.error && tabellSaknas(ig.error);
    if (f.error || o.error || (a.error && !aSaknas) || (ig.error && !igSaknas)) { setStatus('fel'); return null; }
    const ny: FilerUtanObjektData = {
      filer: f.data, objekt: o.data, alias: aSaknas ? [] : a.data,
      ignorerade: new Set(igSaknas ? [] : ig.data.map((r) => r.nyckel)),
    };
    setData(ny);
    setStatus('ok');
    return ny;
  }, []);

  useEffect(() => { void ladda(); }, [ladda]);
  return { status, data, ladda };
}
