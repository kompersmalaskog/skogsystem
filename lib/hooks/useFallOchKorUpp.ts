'use client';

// Hooken kopplar gesten i lib/fallTradGester till kartan medan planeringen ritar kör upp och backa.

import { useEffect, useRef } from 'react';
import { kopplaFallOchKorUppGester, type FallOchKorUppIn } from '../fallTradGester';

export type { FallOchKorUppIn } from '../fallTradGester';

export function useFallOchKorUpp(inp: FallOchKorUppIn): void {
  const ref = useRef(inp);
  ref.current = inp;
  const { map, klar, korUppRita } = inp;
  useEffect(() => {
    if (!map || !klar || !korUppRita) return;
    return kopplaFallOchKorUppGester(map, () => ref.current);
  }, [map, klar, korUppRita]);
}
