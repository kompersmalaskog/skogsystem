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
import type { RutaVal } from '@/lib/kalibrering/grovlek';
import type { ArtSnitt } from '@/lib/kalibrering/rapport';
import type { CalDag } from '@/lib/kalibrering/typer';

async function hamtaKontroll(filnamn: string): Promise<KontrollResponse | null> {
  try {
    const res = await fetch(`/api/kalibrering/kontroll?filnamn=${encodeURIComponent(filnamn)}`);
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

  const { ersatt } = stapel;
  /** Öppna en kontroll. `ersattStapel` = valet i en lista bredvid (iPad/dator): den nya kontrollen ersätter det som visas; annars läggs den ovanpå (art → kontroll). */
  const oppnaKontroll = useCallback(async (filnamn: string, ersattStapel = false) => {
    if (laddarKontroll) return;
    setLaddarKontroll(filnamn);
    const data = await hamtaKontroll(filnamn);
    setLaddarKontroll(null);
    const post: KalibArk = data ? { typ: 'kontroll', data } : { typ: 'fel', filnamn };
    if (ersattStapel) ersatt(post); else lagg(post);
  }, [laddarKontroll, lagg, ersatt]);

  const oppnaStam = useCallback((data: KontrollResponse, stamNummer: number) => {
    if (!data.stockar.some(st => st.stam_nummer === stamNummer)) return;
    lagg({ typ: 'stam', data, stamNummer });
  }, [lagg]);
  const oppnaPlan = useCallback((data: KontrollResponse, stamNummer: number) => lagg({ typ: 'plan', data, stamNummer }), [lagg]);
  const oppnaStock = useCallback((data: KontrollResponse, stockId: number) => lagg({ typ: 'stock', data, stockId }), [lagg]);
  const oppnaArt = useCallback((art: string) => { if (speciesData[art]) lagg({ typ: 'art', art }); }, [lagg, speciesData]);
  const oppnaRuta = useCallback((ruta: RutaVal) => lagg({ typ: 'ruta', ruta }), [lagg]);
  const oppnaDag = useCallback((dag: CalDag, ersattStapel = false) => (ersattStapel ? ersatt({ typ: 'dag', dag }) : lagg({ typ: 'dag', dag })), [lagg, ersatt]);
  const oppnaAtgard = useCallback((id: string) => lagg({ typ: 'atgard', id }), [lagg]);
  const oppnaNyAtgard = useCallback(() => lagg({ typ: 'ny_atgard' }), [lagg]);
  const oppnaHjalp = useCallback(() => lagg({ typ: 'hjalp' }), [lagg]);

  return { ...stapel, laddarKontroll, oppnaKontroll, oppnaStam, oppnaPlan, oppnaStock, oppnaArt, oppnaRuta, oppnaDag, oppnaAtgard, oppnaNyAtgard, oppnaHjalp };
}

export type KalibreringArk = ReturnType<typeof useKalibreringArk>;
