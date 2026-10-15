'use client';

// Flytten bakom en fakturarad, för sheeten "Flytten": det människan angav (id:n — vyn visar namn), det mätta
// (flytt_km) och spåret (maskin_flytt_rattning, de senaste raderna). Läses bara av admin (ekonomi + spår).
// Ett läsfel är ett fel med Försök igen — sheeten öppnas aldrig på gissade värden.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import type { Rattning } from './useBenStatus';

export interface FlyttDetalj {
  id: string;
  maskin_id: string | null;
  extern_maskin: string | null;
  fran_objekt_id: string | null;
  fran_plats_id: string | null;
  till_objekt_id: string | null;
  till_plats_id: string | null;
  flytt_typ: string;
  kund: string | null;
  flytt_km: number | null;
  fakturerbar: boolean;
  avbruten: boolean;
  till_lat: number | null;
  till_lng: number | null;
}

export type DetaljLage =
  | { lage: 'laddar' | 'fel' }
  | { lage: 'klar'; flytt: FlyttDetalj | null; historik: Rattning[] };

const FALT = 'id, maskin_id, extern_maskin, fran_objekt_id, fran_plats_id, till_objekt_id, till_plats_id, flytt_typ, kund, flytt_km, fakturerbar, avbruten, till_lat, till_lng';
export const HISTORIK_ANTAL = 5;

export function useFlyttDetalj(flyttId: string | null | undefined) {
  const [lage, setLage] = useState<DetaljLage>({ lage: 'laddar' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!flyttId) { setLage({ lage: 'klar', flytt: null, historik: [] }); return; }
    let avbruten = false;
    setLage(l => (l.lage === 'klar' ? l : { lage: 'laddar' }));
    (async () => {
      try {
        const [fl, sp] = await Promise.all([
          medAbortRetry(() => supabase.from('maskin_flytt').select(FALT).eq('id', flyttId) as any),
          medAbortRetry(() => supabase.from('maskin_flytt_rattning')
            .select('id, flytt_id, tid, av, anledning, slag, fore, efter, underlag_atgard, position_atgard')
            .eq('flytt_id', flyttId).order('tid', { ascending: false }).limit(HISTORIK_ANTAL) as any),
        ]);
        if (fl.error || sp.error) throw fl.error ?? sp.error;
        if (avbruten) return;
        const rad = (fl.data ?? [])[0];
        const num = (v: unknown) => (v == null ? null : Number(v));
        setLage({
          lage: 'klar',
          flytt: rad ? { ...rad, flytt_km: num(rad.flytt_km), till_lat: num(rad.till_lat), till_lng: num(rad.till_lng), fakturerbar: !!rad.fakturerbar, avbruten: !!rad.avbruten } : null,
          historik: (sp.data ?? []) as Rattning[],
        });
      } catch (e) {
        console.error('[lastbil] flytten: läsfel', e);
        if (!avbruten) setLage(l => (l.lage === 'klar' ? l : { lage: 'fel' }));
      }
    })();
    return () => { avbruten = true; };
  }, [flyttId, nonce]);

  const laddaOm = useCallback(() => setNonce(n => n + 1), []);
  return { lage, laddaOm };
}
