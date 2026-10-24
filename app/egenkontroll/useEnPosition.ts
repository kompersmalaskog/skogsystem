'use client';

// EN position för listans avstånd — inte en bevakning. Listan räknar kilometer på en rad; den behöver inte veta var du står sekund för sekund,
// och en watchPosition med hög noggrannhet som ligger och går så länge sidan är öppen är ett batteridrag man inte ser (beslut Martin 2026-10-20).
// `useLevandePosition` (en levande, högnoggrann bevakning) bor kvar i rundvyn, där man faktiskt går mellan punkter.
//
// Lägre noggrannhet duger, och en position upp till fem minuter gammal duger: avstånd i km ändras inte på en kvart. Nekas platsen, eller
// kommer ingen inom tiden, förblir den null och listan visar inget avstånd (men bilknappen står kvar — kartappen vet var du är).

import { useEffect, useState } from 'react';

export type EnPosition = { lat: number; lng: number };

export const POSITION_MAX_ALDER_MS = 5 * 60 * 1000;
export const POSITION_TIDSGRANS_MS = 10 * 1000;

export function useEnPosition(): EnPosition | null {
  const [pos, setPos] = useState<EnPosition | null>(null);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    let avbruten = false;
    navigator.geolocation.getCurrentPosition(
      (p) => { if (!avbruten) setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { /* nekad eller ingen fix: inget avstånd, inget fel att visa */ },
      { enableHighAccuracy: false, maximumAge: POSITION_MAX_ALDER_MS, timeout: POSITION_TIDSGRANS_MS },
    );
    return () => { avbruten = true; };
  }, []);
  return pos;
}
