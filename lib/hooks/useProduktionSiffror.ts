'use client';
// Läser skördarens filsiffror för Produktion › Detaljer: idag och veckan (måndag t.o.m. idag), en maskin. Bara medan Detaljer är öppen,
// och om var 5:e minut så länge (filerna kommer ungefär var halvtimme). Ett läsfel är ett fel, aldrig 0.
import { useCallback, useEffect, useState } from 'react';
import { rpcPaginerat } from '@/lib/maskinvy/skotarvolym';
import { stockholmDag } from '@/lib/maskinvy/livestatus';
import { veckansMandag, type ProdRad, type TidRad } from '@/lib/produktionSiffror';

export interface ProduktionData { idag: string; prod: ProdRad[]; tid: TidRad[] | null }
export type ProduktionSvar = { lage: 'laser' } | { lage: 'fel' } | { lage: 'ok'; data: ProduktionData };

export const PRODUKTION_UPPDATERA_MS = 5 * 60 * 1000;

export function useProduktionSiffror(maskinId: string | null, aktiv: boolean): { svar: ProduktionSvar; forsok: () => void } {
  const [svar, setSvar] = useState<ProduktionSvar>({ lage: 'laser' });
  const [varv, setVarv] = useState(0);
  const forsok = useCallback(() => setVarv((v) => v + 1), []);
  useEffect(() => {
    if (!aktiv || !maskinId) return;
    let avbruten = false;
    const las = async () => {
      const idag = stockholmDag(Date.now());
      const p = { p_maskin_ids: [maskinId], p_datum_start: veckansMandag(idag), p_datum_slut: idag };
      try {
        const [prod, tid] = await Promise.all([
          rpcPaginerat<ProdRad>('maskindata_produktion', p),
          rpcPaginerat<TidRad>('maskindata_tid', p).catch((e) => { console.warn('[produktion] tiden', e); return null; }),   // tiden är ett tillägg
        ]);
        if (!avbruten) setSvar({ lage: 'ok', data: { idag, prod, tid } });
      } catch (e) {
        console.warn('[produktion]', e);
        if (!avbruten) setSvar({ lage: 'fel' });
      }
    };
    void las();
    const id = window.setInterval(() => { void las(); }, PRODUKTION_UPPDATERA_MS);
    return () => { avbruten = true; window.clearInterval(id); };
  }, [maskinId, aktiv, varv]);
  return { svar, forsok };
}
