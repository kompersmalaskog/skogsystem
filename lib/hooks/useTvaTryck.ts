'use client';

// Hooken kopplar de två trycken i lib/tvaTryck till kartan medan planeringen sätter en kör upp-pil eller ett fällträd.

import { useEffect, useRef } from 'react';
import { kopplaTvaTryck, type TvaTryckIn } from '../tvaTryck';

export type { TvaTryckIn } from '../tvaTryck';

export function useTvaTryck(map: any | null, klar: boolean, inp: TvaTryckIn): void {
  const ref = useRef(inp);
  ref.current = inp;
  const slag = inp.slag;
  useEffect(() => {
    if (!map || !klar || !slag) return;
    return kopplaTvaTryck(map, slag, () => ref.current);
  }, [map, klar, slag]);
}
