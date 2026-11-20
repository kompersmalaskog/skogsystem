// Håller reda på om Vidas lager för trakten är MISSADE (hämtfel) och försöker igen tills de är laddade. Sidan rapporterar varje svar (lib/larm/vidaLager);
// `fel` driver raden "Vidas lager saknas – …" i körvyn och skotarläget, och `forsok` räknas upp för att sidan ska hämta på nytt (var 15:e sekund och
// direkt när nätet kommer tillbaka). Raden försvinner av sig själv när ett svar kommit — 'finns' och 'saknas' (trakten har ingen geometri) är båda svar.
'use client';

import { useCallback, useEffect, useState } from 'react';

export const VIDA_FORSOK_MS = 15000;

export interface VidaLagerFel {
  fel: boolean;
  /** Räknas upp vid varje nytt försök: ta med i beroendelistan för hämtningen. */
  forsok: number;
  rapportera: (status: 'finns' | 'saknas' | 'fel') => void;
}

export function useVidaLagerFel(objektId: string | null): VidaLagerFel {
  const [fel, setFel] = useState(false);
  const [forsok, setForsok] = useState(0);

  // Nytt objekt: börja om (ett fel för förra trakten gäller inte den här).
  useEffect(() => { setFel(false); }, [objektId]);

  useEffect(() => {
    if (!fel) return;
    const timer = setTimeout(() => setForsok((n) => n + 1), VIDA_FORSOK_MS);
    const online = () => setForsok((n) => n + 1);
    window.addEventListener('online', online);
    return () => { clearTimeout(timer); window.removeEventListener('online', online); };
  }, [fel, forsok]);

  const rapportera = useCallback((status: 'finns' | 'saknas' | 'fel') => { setFel(status === 'fel'); }, []);
  return { fel, forsok, rapportera };
}
