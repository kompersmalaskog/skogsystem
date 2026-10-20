// Fällningscirkelns bedömning för körvyn (bara skördaren). Tyst: ingen ljud, inget kort. Reglerna ligger i lib/larm/fallning.
'use client';

import { useMemo } from 'react';
import { bedomFallning, fallningKandidater, NEUTRAL, type FallningIn, type FallningUtfall } from '../larm/fallning';

export interface UseFallningIn extends Omit<FallningIn, 'pos'> {
  /** Körvyn är på OCH maskinen är en skördare (inte skotarläget). */
  aktiv: boolean;
  pos: { lat: number; lon: number } | null;
}

export function useFallning(inp: UseFallningIn): FallningUtfall {
  const { aktiv, markers, svgToLatLon, vida } = inp;
  const lat = inp.pos?.lat, lon = inp.pos?.lon;
  return useMemo(() => {
    if (!aktiv || lat == null || lon == null) return NEUTRAL;
    return bedomFallning(fallningKandidater({ pos: { lat, lon }, markers, svgToLatLon, vida }));
    // svgToLatLon byts varje rendering; markeringarnas innehåll avgör (som i useKorvyLarm).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv, lat, lon, markers, vida]);
}
