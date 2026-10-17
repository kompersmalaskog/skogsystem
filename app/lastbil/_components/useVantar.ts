'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import { hamtaAlla } from '@/lib/supabaseAlla';
import type { VantandeRad } from './vantar';

export type VantarLage =
  | { lage: 'laddar' }
  | { lage: 'fel' }
  | { lage: 'klar'; rader: VantandeRad[] };

/**
 * Det som väntar på godkännande (aktiva, ogodkända, ofakturerade flyttar) över ALLA perioder. Bara
 * admin (`aktiv`): fakturaunderlaget är ekonomidata. Ett läsfel är ett fel — aldrig "ingenting väntar".
 */
export function useVantar(aktiv: boolean) {
  const [lage, setLage] = useState<VantarLage>({ lage: 'laddar' });
  const [omforsok, setOmforsok] = useState(0);
  const [tystOm, setTystOm] = useState(0);
  const senasteTyst = useRef(0);

  useEffect(() => {
    if (!aktiv) return;
    let avbruten = false;
    const tyst = tystOm !== senasteTyst.current;
    senasteTyst.current = tystOm;
    if (!tyst) setLage({ lage: 'laddar' });
    (async () => {
      const r = await medAbortRetry(() => hamtaAlla<VantandeRad>(
        () => supabase.from('fakturaunderlag_flytt')
          .select('id, datum')
          .eq('status', 'aktiv').is('fakturerad_tid', null).is('godkand_tid', null) as any,
        'id',
      ));
      if (avbruten) return;
      if (r.error) {
        console.error('[lastbil] väntar på godkännande: läsfel', r.error);
        if (!tyst) setLage({ lage: 'fel' });   // en tyst omläsning lämnar det som visas
        return;
      }
      setLage({ lage: 'klar', rader: r.data });
    })();
    return () => { avbruten = true; };
  }, [aktiv, omforsok, tystOm]);

  const forsokIgen = useCallback(() => setOmforsok(n => n + 1), []);
  const laddaOmTyst = useCallback(() => setTystOm(n => n + 1), []);
  return { lage, forsokIgen, laddaOmTyst };
}
