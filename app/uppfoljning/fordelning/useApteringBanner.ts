'use client';

import { useEffect, useState } from 'react';
import type { ObjektVy } from './types';

export interface ApteringBanner {
  visa: boolean;
  antal: number;
  mening: string | null; // läge 2-meningen när exakt ETT objekt avviker
  href: string; // läge 3 för objektet, eller listan vid flera
}

/**
 * Startsidebannern följer Datahälsa-mönstret: visas ENDAST när minst ett
 * AKTIVT objekt är i läge 2 (avvikelse). Ett objekt → meningen + länk till
 * dess läge 3. Flera → "N objekt att titta på" + länk till listan. Inom mål
 * → ingenting (tystnadsregeln).
 */
export function useApteringBanner(): ApteringBanner {
  const [b, setB] = useState<ApteringBanner>({ visa: false, antal: 0, mening: null, href: '/uppfoljning/fordelning' });
  useEffect(() => {
    let av = false;
    fetch('/api/fordelning?scope=aktiva')
      .then((r) => (r.ok ? r.json() : { objekt: [] }))
      .then((d) => {
        if (av) return;
        const läge2: ObjektVy[] = (d.objekt ?? []).filter((o: ObjektVy) => o.lage === 2);
        if (läge2.length === 0) { setB({ visa: false, antal: 0, mening: null, href: '/uppfoljning/fordelning' }); return; }
        if (läge2.length === 1) {
          const o = läge2[0];
          setB({ visa: true, antal: 1, mening: o.mening, href: `/uppfoljning/fordelning?objekt=${encodeURIComponent(o.objectKey)}` });
        } else {
          setB({ visa: true, antal: läge2.length, mening: null, href: '/uppfoljning/fordelning' });
        }
      })
      .catch(() => {});
    return () => { av = true; };
  }, []);
  return b;
}
