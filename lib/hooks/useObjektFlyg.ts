'use client';

// Sveper kartan till det valda objektet (lib/objektFlyg), EN gång per objekt, när objektets geometrisvar kommit (traktgräns finns eller saknas —
// båda är ett svar). Bara när `aktiv` (planeringsvyn); körvyn och /maskin äger sina egna kameror. Gäller både ett objekt man valt i listan (rad eller
// prick) och ett som Planering öppnar direkt (senaste objektet, adressen).

import { useEffect, useRef } from 'react';
import { flygTillObjekt, objektStartKamera, traktGrans } from '../objektFlyg';

interface Opt {
  map: any | null;
  aktiv: boolean;
  objekt: any | null;
  /** objekt-id vars geometrisvar har kommit (page.traktGeoHamtadFor) */
  geometriHamtadFor: string | null;
  geometri: { features?: any[] } | null;
  /** något annat äger kameran (maskinläges startsekvens, körvyn) → inget svep */
  kameraUpptagen?: () => boolean;
}

export function useObjektFlyg({ map, aktiv, objekt, geometriHamtadFor, geometri, kameraUpptagen }: Opt): void {
  const flygdRef = useRef<string | null>(null);
  const upptagenRef = useRef(kameraUpptagen);
  upptagenRef.current = kameraUpptagen;
  const id: string | null = objekt?.id ?? null;
  useEffect(() => {
    if (!aktiv || !map || !id) return;
    if (geometriHamtadFor !== id) return;               // geometrisvaret för DET HÄR objektet har inte kommit (ett gammalt objekts svar räknas inte)
    if (flygdRef.current === id) return;                // en gång per objekt: en omladdad geometri sveper inte igen
    if (upptagenRef.current?.()) return;
    flygdRef.current = id;
    flygTillObjekt(map, { gran: traktGrans(geometri), start: objektStartKamera(objekt) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- objekt läses bara för koordinaten; id styr
  }, [aktiv, map, id, geometriHamtadFor, geometri]);
}
