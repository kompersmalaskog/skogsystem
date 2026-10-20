'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { lasMaskiner } from './lasMaskiner';
import type { Flytt } from './maskiner';

export type MaskinerLage = { lage: 'laddar' } | { lage: 'fel' } | { lage: 'klar'; flyttar: Flytt[] };

/**
 * Årets flyttar per maskin, lästa när `aktiv`. Ett läsfel är ett fel med "Försök igen". En TYST omläsning (efter en rättning i
 * sheeten "Flytten") behåller det som visas tills det nya svaret kommit — raderna blinkar inte till "Läser …".
 */
export function useMaskiner(ar: number, aktiv: boolean) {
  const [lage, setLage] = useState<MaskinerLage>({ lage: 'laddar' });
  const [omforsok, setOmforsok] = useState(0);
  const [tystOm, setTystOm] = useState(0);
  const senasteTyst = useRef(0);
  const senasteAr = useRef(ar);

  useEffect(() => {
    if (!aktiv) return;
    let avbruten = false;
    const tyst = tystOm !== senasteTyst.current && ar === senasteAr.current;
    senasteTyst.current = tystOm;
    senasteAr.current = ar;
    if (!tyst) setLage({ lage: 'laddar' });
    void lasMaskiner(ar).then(r => {
      if (avbruten) return;
      if (r.ok) setLage({ lage: 'klar', flyttar: r.flyttar });
      else if (!tyst) setLage({ lage: 'fel' });
    });
    return () => { avbruten = true; };
  }, [ar, aktiv, omforsok, tystOm]);

  const forsokIgen = useCallback(() => setOmforsok(n => n + 1), []);
  const laddaOmTyst = useCallback(() => setTystOm(n => n + 1), []);
  return { lage, forsokIgen, laddaOmTyst };
}
