'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [tystOm, setTystOm] = useState(0);
  const nyckel = periodTillText(period);
  // En TYST omläsning (efter en rättning) behåller det som visas tills det nya svaret kommit; ett fel i den
  // lämnar det som visas (det var sant när det lästes) och nästa omläsning rättar.
  const senasteTyst = useRef(0);
  const senasteNyckel = useRef(nyckel);

  useEffect(() => {
    if (!aktiv) return;
    let avbruten = false;
    const tyst = tystOm !== senasteTyst.current && nyckel === senasteNyckel.current;
    senasteTyst.current = tystOm;
    senasteNyckel.current = nyckel;
    if (!tyst) setLage({ lage: 'laddar' });
    const { fran, till } = periodTidsintervall(period);
    void lasRundor(fran, till).then(r => {
      if (avbruten) return;
      if (r.ok) setLage({ lage: 'klar', rundor: r.rundor });
      else if (!tyst) setLage({ lage: 'fel' });
    });
    return () => { avbruten = true; };
    // period är helt bestämd av `nyckel`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nyckel, aktiv, omforsok, tystOm]);

  const forsokIgen = useCallback(() => setOmforsok(n => n + 1), []);
  const laddaOmTyst = useCallback(() => setTystOm(n => n + 1), []);
  return { lage, forsokIgen, laddaOmTyst };
}

/**
 * EN runda för arket när den inte redan finns i listan (tryck på "Senaste körning" på Nu). Rundans
 * grannar i tiden läses med, så överlapp och fortsättning märks som i listan.
 */
export function useEnRunda(val: { id: string; start: string } | null, finnsRedan: boolean) {
  const [lage, setLage] = useState<RundorLage>({ lage: 'laddar' });
  const [omforsok, setOmforsok] = useState(0);
  const [tystOm, setTystOm] = useState(0);
  const senasteTyst = useRef(0);
  const id = val?.id ?? null;
  const start = val?.start ?? null;

  useEffect(() => {
    if (!id || !start || finnsRedan) return;
    let avbruten = false;
    const tyst = tystOm !== senasteTyst.current;
    senasteTyst.current = tystOm;
    if (!tyst) setLage({ lage: 'laddar' });
    const dygn = 86400000;
    void lasRundor(new Date(Date.parse(start) - dygn).toISOString(), new Date(Date.parse(start) + 2 * dygn).toISOString()).then(r => {
      if (avbruten) return;
      if (r.ok) setLage({ lage: 'klar', rundor: r.rundor });
      else if (!tyst) setLage({ lage: 'fel' });
    });
    return () => { avbruten = true; };
  }, [id, start, finnsRedan, omforsok, tystOm]);

  const forsokIgen = useCallback(() => setOmforsok(n => n + 1), []);
  const laddaOmTyst = useCallback(() => setTystOm(n => n + 1), []);
  return { lage, forsokIgen, laddaOmTyst };
}
