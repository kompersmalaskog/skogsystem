'use client';

import { useCallback, useEffect, useState } from 'react';
import { lasMaskinNamn, lasPlatsNamn, unika } from './lasNamn';
import type { UnderlagRad } from './fakturerbart';

export interface Namnkartor { maskin: Map<string, string>; objekt: Map<string, string>; plats: Map<string, string> }
export type NamnLage =
  | { lage: 'laddar' }
  | { lage: 'fel' }
  | { lage: 'klar'; namn: Namnkartor };

/**
 * Namnen kvittoraderna behöver (maskin, från/till), läst när `aktiv`. Ett läsfel är ett fel för hela
 * fliken med "Försök igen" — aldrig en lista där platserna tyst blivit "okänd plats".
 */
export function useUnderlagNamn(rader: readonly UnderlagRad[] | null, aktiv: boolean) {
  const [lage, setLage] = useState<NamnLage>({ lage: 'laddar' });
  const [omforsok, setOmforsok] = useState(0);
  // Nyckeln är radernas id:n: byts perioden läses namnen om, annars inte.
  const nyckel = rader ? rader.map(r => r.id).join(',') : null;

  useEffect(() => {
    if (!aktiv || !rader) return;
    let avbruten = false;
    setLage({ lage: 'laddar' });
    (async () => {
      try {
        const [maskin, objekt, plats] = await Promise.all([
          lasMaskinNamn(),
          lasPlatsNamn('objekt', unika(rader.flatMap(r => [r.fran_objekt_id, r.till_objekt_id]))),
          lasPlatsNamn('flyttplats', unika(rader.flatMap(r => [r.fran_plats_id, r.till_plats_id]))),
        ]);
        if (!avbruten) setLage({ lage: 'klar', namn: { maskin, objekt, plats } });
      } catch (e) {
        console.error('[lastbil] fakturering: namn, läsfel', e);
        if (!avbruten) setLage({ lage: 'fel' });
      }
    })();
    return () => { avbruten = true; };
    // rader är helt bestämd av `nyckel`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nyckel, aktiv, omforsok]);

  const forsokIgen = useCallback(() => setOmforsok(n => n + 1), []);
  return { lage, forsokIgen };
}
