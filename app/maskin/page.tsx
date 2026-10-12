'use client';

// /maskin?som=<maskin_id> — "Öppna som maskin" (bara admin). Samma app som /planering, men laddad
// från början i maskinläge som den maskinen: startsekvens (svart → kartan tonar upp över traktgränsen →
// flyTo ner till maskinen → objekt), förarlista, körvy. Inga DB-skrivningar.
// DATORNS GPS ANVÄNDS ALDRIG här: gpsKalla går i fast läge (ingen geolocation/serieport) och startpositionen är
// maskinens senast kända (senaste hyttspår-punkten), utlagd av PlannerPage.
// FÖRLADDNING (kortare svart): kartans kod (maplibre-gl) och maskinens hyttspårs-position hämtas redan HÄR, vid montering,
// parallellt med inloggning/medarbetare/maskinregister — i stället för efter dem, en fråga i taget.
// Behörighet (admin) och maskinval avgörs i PlannerPage via lib/maskinSom.
//
// Suspense-fallbacken är HELSVART (ingen logga, ingen text): useSearchParams() gör att den statiska HTML:en
// bara innehåller fallbacken, så det första som ritas är svart — aldrig planeringsvyn. Loggan visas
// bara i felskärmarna (ej behörig / okänd maskin / laddning fastnar).

import { Suspense, useEffect, useLayoutEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import PlannerPage from '../planering/page';
import { MaskinSomContext } from '@/lib/maskinSomContext';
import { MASKIN_SOM_PARAM } from '@/lib/maskinSom';
import { StartSvartSkarm } from '@/components/maskin/StartSkarmar';
import { startaFastGpsLage, stoppaFastGpsLage } from '@/lib/gpsKalla';
import { forladdaSparStart } from '@/lib/maskinPositionDb';
import { supabase } from '@/lib/supabase';

// Layout-effekt (körs före ALLA passiva effekter i samma commit → före PlannerPages GPS-prenumeration). På servern
// finns ingen layout-effekt att köra (och ingen GPS) → vanlig useEffect där, utan SSR-varning.
const useForeGps = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function MaskinInnehall() {
  const som = useSearchParams().get(MASKIN_SOM_PARAM);
  // /maskin?som= → fast GPS-läge. Stängs när sidan lämnas så /planering aldrig ärver en utlagd position.
  useForeGps(() => {
    if (!som) return;
    startaFastGpsLage();
    // Kartans kod + positionen hämtas nu, inte först när ett objekt är valt. Misslyckas något hämtar PlannerPage själv.
    try { void import('@/components/MapLibreMap'); } catch { /* */ }
    try { void forladdaSparStart(supabase, som); } catch { /* */ }
    return () => stoppaFastGpsLage();
  }, [som]);
  return (
    <MaskinSomContext.Provider value={som}>
      <PlannerPage />
    </MaskinSomContext.Provider>
  );
}

export default function MaskinPage() {
  return (
    <Suspense fallback={<StartSvartSkarm />}>
      <MaskinInnehall />
    </Suspense>
  );
}
