'use client';

// Läser massavedens längd för alla aktiva gallringsskördare, 30 dagar bakåt (och förra veckan, som ryms i det).
// Ett läsfel är ett fel (fel satt, rader null), aldrig en tom lista. Läser om var 5:e minut medan den är aktiv.

import { useCallback, useEffect, useRef, useState } from 'react';
import { rpcPaginerat } from '@/lib/maskinvy/skotarvolym';
import { forraVeckan, laggTillDagar, svenskIdag, type MassaRad } from '@/lib/massaLangd';

export const MASSA_UPPDATERA_MS = 5 * 60 * 1000;

export function useMassaLangd(maskiner: readonly string[], aktiv: boolean) {
  const [rader, setRader] = useState<MassaRad[] | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [idag, setIdag] = useState(() => svenskIdag());
  const nyckel = [...maskiner].sort().join(',');
  const omN = useRef(0);
  const [forsok, setForsok] = useState(0);

  useEffect(() => {
    if (!aktiv || !nyckel) return;
    let levande = true;
    const n = ++omN.current;
    const las = async () => {
      const dag = svenskIdag();
      const fran = [laggTillDagar(dag, -29), forraVeckan(dag).fran].sort()[0];
      try {
        const d = await rpcPaginerat<MassaRad>('massa_langd', { p_maskiner: nyckel.split(','), p_fran: fran, p_till: dag });
        if (!levande || n !== omN.current) return;
        setRader(d.map(r => ({ ...r, antal: Number(r.antal), summa_cm: Number(r.summa_cm), langd_dm: Number(r.langd_dm) })));
        setIdag(dag);
        setFel(null);
      } catch (e) {
        if (!levande || n !== omN.current) return;
        console.warn('[massaLangd] läsfel', e);
        setFel('Kunde inte läsa massaveden just nu');
      }
    };
    las();
    const t = setInterval(las, MASSA_UPPDATERA_MS);
    return () => { levande = false; clearInterval(t); };
  }, [aktiv, nyckel, forsok]);

  const forsokIgen = useCallback(() => setForsok(f => f + 1), []);
  return { rader, fel, idag, forsokIgen };
}
