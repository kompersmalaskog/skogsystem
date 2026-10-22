'use client';
/**
 * ARKEN BAKOM KALIBRERINGSVYN — stapeln (useArkStack) och det som öppnar ett ark: kontrollen hämtas först (och bara EN i taget),
 * resten ligger redan i minnet. Flyttat ur app/kalibrering/page.tsx (pushModal + openKontrollFull/openStockModal/openSpeciesDetail/
 * openCalendarDayModal), oförändrat: samma hämtning, samma fel ("Kunde inte ladda kontroll"), samma ordning på stapeln.
 */
import { useCallback, useState } from 'react';
import type { KontrollResponse } from '@/app/api/kalibrering/kontroll/route';
import type { KalibArk } from '@/components/kalibrering/arkTyper';
import { useArkStack } from '@/lib/hooks/useArkStack';
import type { ArtSnitt } from '@/lib/kalibrering/rapport';
import type { CalDag, DetaljKontrollStock } from '@/lib/kalibrering/typer';

async function hamtaKontroll(filnamn: string): Promise<KontrollResponse | null> {
  try {
    const res = await fetch(`/api/kalibrering/kontroll?filnamn=${encodeURIComponent(filnamn)}&key=skogsystem-debug`);
    if (!res.ok) {
      console.error(`fetchKontroll: HTTP ${res.status}`);
      return null;
    }
    return await res.json() as KontrollResponse;
  } catch (e) {
    console.error('fetchKontroll fel:', e);
    return null;
  }
}

export function useKalibreringArk(speciesData: Record<string, ArtSnitt>) {
  const stapel = useArkStack<KalibArk>();
  const { lagg } = stapel;
  // Filnamnet som hämtas just nu, eller null — knappen "Visa alla stockar" säger "Laddar…" och ett andra tryck gör ingenting.
  const [laddarKontroll, setLaddarKontroll] = useState<string | null>(null);

  const oppnaKontroll = useCallback(async (filnamn: string) => {
    if (laddarKontroll) return;
    setLaddarKontroll(filnamn);
    const data = await hamtaKontroll(filnamn);
    setLaddarKontroll(null);
    lagg(data ? { typ: 'kontroll', data } : { typ: 'fel', filnamn });
  }, [laddarKontroll, lagg]);

  const oppnaStam = useCallback((data: KontrollResponse, stamNummer: number) => {
    if (!data.stockar.some(st => st.stam_nummer === stamNummer)) return;
    lagg({ typ: 'stam', data, stamNummer });
  }, [lagg]);
  const oppnaPlan = useCallback((data: KontrollResponse, stamNummer: number) => lagg({ typ: 'plan', data, stamNummer }), [lagg]);
  const oppnaStock = useCallback((data: KontrollResponse, stockId: number) => lagg({ typ: 'stock', data, stockId }), [lagg]);
  const oppnaSenasteStock = useCallback((stock: DetaljKontrollStock) => lagg({ typ: 'seStock', stock }), [lagg]);
  const oppnaArt = useCallback((art: string) => { if (speciesData[art]) lagg({ typ: 'art', art }); }, [lagg, speciesData]);
  const oppnaDag = useCallback((dag: CalDag) => lagg({ typ: 'dag', dag }), [lagg]);

  return { ...stapel, laddarKontroll, oppnaKontroll, oppnaStam, oppnaPlan, oppnaStock, oppnaSenasteStock, oppnaArt, oppnaDag };
}

export type KalibreringArk = ReturnType<typeof useKalibreringArk>;
