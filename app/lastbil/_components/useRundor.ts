'use client';

import { useCallback, useEffect, useState } from 'react';
import { lasRundor } from './lasRundor';
import { periodTidsintervall, periodTillText, type Period } from './period';
import type { Runda } from './rundor';

export type RundorLage =
  | { lage: 'laddar' }
  | { lage: 'fel' }
  | { lage: 'klar'; rundor: Runda[] };

/**
 * Rundorna för en period (månad eller år), läst när `aktiv`. Ett läsfel är ett fel med "Försök igen":
 * ett halvt läst underlag ger summor som ser rätta ut men inte är det.
 */
export function useRundor(period: Period, aktiv: boolean) {
  const [lage, setLage] = useState<RundorLage>({ lage: 'laddar' });
  const [omforsok, setOmforsok] = useState(0);
  const nyckel = periodTillText(period);

  useEffect(() => {
    if (!aktiv) return;
    let avbruten = false;
    setLage({ lage: 'laddar' });
    const { fran, till } = periodTidsintervall(period);
    void lasRundor(fran, till).then(r => {
      if (avbruten) return;
      setLage(r.ok ? { lage: 'klar', rundor: r.rundor } : { lage: 'fel' });
    });
    return () => { avbruten = true; };
    // period är helt bestämd av `nyckel`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nyckel, aktiv, omforsok]);

  const forsokIgen = useCallback(() => setOmforsok(n => n + 1), []);
  return { lage, forsokIgen };
}

/**
 * EN runda för arket när den inte redan finns i listan (tryck på "Senaste körning" på Nu). Rundans
 * grannar i tiden läses med, så överlapp och fortsättning märks som i listan.
 */
export function useEnRunda(val: { id: string; start: string } | null, finnsRedan: boolean) {
  const [lage, setLage] = useState<RundorLage>({ lage: 'laddar' });
  const [omforsok, setOmforsok] = useState(0);
  const id = val?.id ?? null;
  const start = val?.start ?? null;

  useEffect(() => {
    if (!id || !start || finnsRedan) return;
    let avbruten = false;
    setLage({ lage: 'laddar' });
    const dygn = 86400000;
    void lasRundor(new Date(Date.parse(start) - dygn).toISOString(), new Date(Date.parse(start) + 2 * dygn).toISOString()).then(r => {
      if (avbruten) return;
      setLage(r.ok ? { lage: 'klar', rundor: r.rundor } : { lage: 'fel' });
    });
    return () => { avbruten = true; };
  }, [id, start, finnsRedan, omforsok]);

  const forsokIgen = useCallback(() => setOmforsok(n => n + 1), []);
  return { lage, forsokIgen };
}
