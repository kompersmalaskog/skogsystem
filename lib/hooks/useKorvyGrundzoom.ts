// Körvyns grundzoom för maskinen (lib/korvyZoom). Värdet läses SYNKRONT när maskinen blir känd (inte i en effekt efteråt), och `grundzoomRef`
// följer alltid senaste värdet — kamerans effekter och timers läser refen så att de aldrig sitter fast på en gammal zoom.
import { useCallback, useMemo, useRef, useState } from 'react';
import { grundzoomFor, sparaGrundzoom } from '../korvyZoom';

export function useKorvyGrundzoom(maskinId: string | null | undefined) {
  // Sparad i state per maskin: bytet av maskin (enheten blir känd först efter första renderingen) ger rätt värde direkt.
  const [sparad, setSparad] = useState<{ maskin: string | null; zoom: number } | null>(null);
  const franLagring = useMemo(() => grundzoomFor(maskinId), [maskinId]);   // en läsning per maskin, inte en per rendering (körvyn renderar vid varje GPS-punkt)
  const grundzoom = sparad && sparad.maskin === (maskinId || null) ? sparad.zoom : franLagring;
  const grundzoomRef = useRef<number>(grundzoom);
  grundzoomRef.current = grundzoom;
  /** Spara `zoom` som ny grundzoom. Returnerar det som sparades (avrundat, i spannet) eller null. */
  const spara = useCallback((zoom: number): number | null => {
    const z = sparaGrundzoom(maskinId, zoom);
    if (z == null) return null;
    grundzoomRef.current = z;
    setSparad({ maskin: maskinId || null, zoom: z });
    return z;
  }, [maskinId]);
  return { grundzoom, grundzoomRef, spara };
}
