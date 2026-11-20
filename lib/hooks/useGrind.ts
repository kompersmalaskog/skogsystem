// Grindens kod i körvyn (och skotarläget): kortet "Grind · Stäng efter dig" med koden, inom ~50 m. Reglerna ligger i lib/grind. Tyst.
'use client';

import { useEffect, useRef, useState } from 'react';
import type { LatLon } from '../larm/geo';
import { grindarUrMarkeringar, stegaGrind, TOMT_GRIND, type GrindKort, type GrindState } from '../grind';

export function useGrind(inp: { aktiv: boolean; pos: LatLon | null; markers: readonly any[]; svgToLatLon: (x: number, y: number) => LatLon }): GrindKort | null {
  const [kort, setKort] = useState<GrindKort | null>(null);
  const stateRef = useRef<GrindState>(TOMT_GRIND);
  const lat = inp.pos?.lat, lon = inp.pos?.lon;
  const { aktiv, markers, svgToLatLon } = inp;
  useEffect(() => {
    if (!aktiv || lat == null || lon == null) { stateRef.current = TOMT_GRIND; setKort((k) => (k ? null : k)); return; }
    const r = stegaGrind({ grindar: grindarUrMarkeringar(markers, svgToLatLon), pos: { lat, lon }, state: stateRef.current });
    stateRef.current = r.state;
    setKort((k) => (k?.id === r.kort?.id && k?.kod === r.kort?.kod && k?.avstandM === r.kort?.avstandM ? k : r.kort));
    // svgToLatLon byts varje rendering; markeringarnas innehåll avgör (som i useKorvyLarm).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv, lat, lon, markers]);
  return kort;
}
