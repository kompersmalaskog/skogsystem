'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LastbilData } from './nu';

export type NuLage =
  | { lage: 'laddar' }
  | { lage: 'utloggad' }
  | { lage: 'fel' }                                       // inget att visa: första läsningen misslyckades
  | { lage: 'klar'; data: LastbilData; uppdateringsFel: boolean };

const UPPDATERA_MS = 60_000;

/**
 * Lastbilens läge ur /api/lastbil (position, tank, hälsa, pågående runda, senaste rundor).
 * Läser om var minut medan Nu-fliken är öppen. Misslyckas en omläsning visas det senaste
 * kända svaret med en tyst notering — aldrig en tom vy för att nätet hickade.
 */
export function useLastbilNu(aktiv: boolean) {
  const [lage, setLage] = useState<NuLage>({ lage: 'laddar' });

  const las = useCallback(async (): Promise<void> => {
    try {
      const r = await fetch('/api/lastbil', { cache: 'no-store' });
      if (r.status === 401) { setLage({ lage: 'utloggad' }); return; }
      const j = r.ok ? await r.json() : null;
      if (!j?.ok) throw new Error('lastbil: ogiltigt svar');
      setLage({ lage: 'klar', data: j as LastbilData, uppdateringsFel: false });
    } catch {
      setLage(f => f.lage === 'klar' ? { ...f, uppdateringsFel: true } : { lage: 'fel' });
    }
  }, []);

  useEffect(() => {
    if (!aktiv) return;
    let avbruten = false;
    const kor = () => { if (!avbruten) void las(); };
    kor();
    const iv = setInterval(kor, UPPDATERA_MS);
    return () => { avbruten = true; clearInterval(iv); };
  }, [aktiv, las]);

  const forsokIgen = useCallback(() => { setLage({ lage: 'laddar' }); void las(); }, [las]);
  return { lage, forsokIgen };
}
