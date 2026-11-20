'use client';

import { useCallback, useEffect, useState } from 'react';
import { lasViktManad } from './lasVikt';
import type { ViktRad } from './vikt';

export type ViktLage = { lage: 'laddar' } | { lage: 'fel' } | { lage: 'klar'; rader: ViktRad[] };

/** Årets viktuppdelade körning, läst när `aktiv`. Ett läsfel är ett fel med "Försök igen" — Förbrukning och Körsträcka visar det, resten av sidan påverkas inte. */
export function useVikt(ar: number, aktiv: boolean) {
  const [lage, setLage] = useState<ViktLage>({ lage: 'laddar' });
  const [omforsok, setOmforsok] = useState(0);

  useEffect(() => {
    if (!aktiv) return;
    let avbruten = false;
    setLage({ lage: 'laddar' });
    void lasViktManad(ar).then(r => {
      if (avbruten) return;
      setLage(r.ok ? { lage: 'klar', rader: r.rader } : { lage: 'fel' });
    });
    return () => { avbruten = true; };
  }, [ar, aktiv, omforsok]);

  const forsokIgen = useCallback(() => setOmforsok(n => n + 1), []);
  return { lage, forsokIgen };
}
