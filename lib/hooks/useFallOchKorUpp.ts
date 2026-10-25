'use client';

// Hooken kopplar gesterna i lib/fallTradGester till kartan medan planeringen redigerar (träd) eller ritar kör upp och backa.

import { useEffect, useRef } from 'react';
import { kopplaFallOchKorUppGester, type FallOchKorUppIn } from '../fallTradGester';

export type { FallOchKorUppIn } from '../fallTradGester';

export function useFallOchKorUpp(inp: FallOchKorUppIn): void {
  const ref = useRef(inp);
  ref.current = inp;
  const { map, klar, redigerbara, korUppRita } = inp;
  useEffect(() => {
    if (!map || !klar || !(redigerbara || korUppRita)) return;
    return kopplaFallOchKorUppGester(map, () => ref.current);
  }, [map, klar, redigerbara, korUppRita]);
}
