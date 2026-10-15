'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { periodIntervall, periodTillText, type Period } from './period';
import { summeraFakturerbart, type FakturerbartSumma, type UnderlagRad } from './fakturerbart';

export type FakturerbartStatus =
  | { lage: 'laddar' }
  | { lage: 'klar'; summa: FakturerbartSumma; rader: UnderlagRad[] }
  | { lage: 'fel' };

const FALT = 'id, km, status, fakturerad_tid, kund, datum, maskin, fran_objekt_id, fran_plats_id, till_objekt_id, till_plats_id, struken_tid, struken_anledning';

/**
 * Fakturerbart för en period, ur fakturaunderlag_flytt (ekonomidata: bara admin läser, RLS).
 * EN läsning bär både remsans summa och kvittots rader (Fakturering-fliken), så de aldrig skiljer sig åt.
 * Läses bara när `aktiv` — en förare ska aldrig skicka frågan och få en tyst tom lista.
 *
 * Ett läsfel är ett FEL, aldrig 0 km: remsan säger det och erbjuder "Försök igen". Pengatalet
 * (fakturerbart-summan) får aldrig visa en nolla för att läsningen misslyckades.
 */
export function useFakturerbart(period: Period, aktiv: boolean) {
  const [status, setStatus] = useState<FakturerbartStatus>({ lage: 'laddar' });
  const [omforsok, setOmforsok] = useState(0);
  const nyckel = periodTillText(period);

  useEffect(() => {
    if (!aktiv) return;
    let avbruten = false;
    setStatus({ lage: 'laddar' });
    const { fran, till } = periodIntervall(period);
    (async () => {
      const r = await medAbortRetry(() => hamtaAlla<UnderlagRad>(
        () => supabase.from('fakturaunderlag_flytt')
          .select(FALT)
          .gte('datum', fran)
          .lt('datum', till) as any,
        'id',
      ));
      if (avbruten) return;
      if (r.error) {
        console.error('[lastbil] fakturerbart: läsfel', r.error);
        setStatus({ lage: 'fel' });
        return;
      }
      setStatus({ lage: 'klar', summa: summeraFakturerbart(r.data), rader: r.data });
    })();
    return () => { avbruten = true; };
    // period är helt bestämd av `nyckel`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nyckel, aktiv, omforsok]);

  const forsokIgen = useCallback(() => setOmforsok(n => n + 1), []);
  return { status, forsokIgen };
}
