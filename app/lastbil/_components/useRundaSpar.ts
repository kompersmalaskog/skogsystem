'use client';

import { useEffect, useState } from 'react';

export type Segment = { coords: [number, number][]; matchad: boolean };
export type SparLage =
  | { lage: 'laddar' }
  | { lage: 'fel' }
  | { lage: 'klar'; segment: Segment[]; punkter: { lat: number; lng: number }[]; nagonOmatchad: boolean; matchningPa: boolean };

/**
 * Spåret för EN runda, för kartan i arket (/api/lastbil/spar: lastbil_logg i rundans tidsfönster, matchat
 * mot vägnätet). Hämtas först när arket öppnas — kartan är aldrig en yta man landar på.
 */
export function useRundaSpar(rundaId: string | null) {
  const [lage, setLage] = useState<SparLage>({ lage: 'laddar' });
  useEffect(() => {
    if (!rundaId) return;
    let avbruten = false;
    setLage({ lage: 'laddar' });
    fetch(`/api/lastbil/spar?runda=${encodeURIComponent(rundaId)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (avbruten) return;
        if (!j?.ok) { setLage({ lage: 'fel' }); return; }
        setLage({ lage: 'klar', segment: j.segment ?? [], punkter: j.spar ?? [], nagonOmatchad: !!j.nagonOmatchad, matchningPa: !!j.matchningPa });
      })
      .catch(() => { if (!avbruten) setLage({ lage: 'fel' }); });
    return () => { avbruten = true; };
  }, [rundaId]);
  return lage;
}
