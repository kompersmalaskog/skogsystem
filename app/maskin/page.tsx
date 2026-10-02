'use client';

// /maskin?som=<maskin_id> — "Öppna som maskin" (bara admin/chef). Samma app som /planering, men laddad
// från början i maskinläge som den maskinen: startsekvens (logga → söker GPS → objekt), förarlista, körvy.
// Inga DB-skrivningar. Behörighet (admin/chef) och maskinval avgörs i PlannerPage via lib/maskinSom.
//
// Suspense-fallbacken ÄR loggan: useSearchParams() gör att den statiska HTML:en bara innehåller fallbacken,
// så det första som ritas är loggan — aldrig planeringsvyn.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PlannerPage from '../planering/page';
import { MaskinSomContext } from '@/lib/maskinSomContext';
import { MASKIN_SOM_PARAM } from '@/lib/maskinSom';
import { StartLoggaSkarm } from '@/components/maskin/StartSkarmar';

function MaskinInnehall() {
  const som = useSearchParams().get(MASKIN_SOM_PARAM);
  return (
    <MaskinSomContext.Provider value={som}>
      <PlannerPage />
    </MaskinSomContext.Provider>
  );
}

export default function MaskinPage() {
  return (
    <Suspense fallback={<StartLoggaSkarm />}>
      <MaskinInnehall />
    </Suspense>
  );
}
