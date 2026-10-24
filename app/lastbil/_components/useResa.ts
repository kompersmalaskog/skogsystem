'use client';

import { useCallback, useEffect, useState } from 'react';
import { lasResa } from './lasResa';
import type { FilDag } from './maskinResa';

export type ResaLage = { lage: 'laddar' } | { lage: 'fel' } | { lage: 'klar'; dagar: FilDag[] };

/** Var maskinen jobbat under året (ur dess filer). Null = ingen egen maskin (andras maskiner) → inget läses. */
export function useResa(maskinId: string | null, ar: number) {
  const [lage, setLage] = useState<ResaLage>({ lage: 'laddar' });
  const [omforsok, setOmforsok] = useState(0);
  useEffect(() => {
    if (!maskinId) return;
    let avbruten = false;
    setLage({ lage: 'laddar' });
    void lasResa(maskinId, ar).then(r => { if (!avbruten) setLage(r.ok ? { lage: 'klar', dagar: r.dagar } : { lage: 'fel' }); });
    return () => { avbruten = true; };
  }, [maskinId, ar, omforsok]);
  const forsokIgen = useCallback(() => setOmforsok(n => n + 1), []);
  return { lage, forsokIgen };
}
