'use client';

// /maskin?som=<maskin_id> — "Öppna som maskin" (bara admin/chef). Samma app som /planering, men laddad
// från början i maskinläge som den maskinen: startsekvens (svart → kartan tonar upp över traktgränsen →
// flyTo ner till maskinen → objekt), förarlista, körvy. Inga DB-skrivningar.
// Behörighet (admin/chef) och maskinval avgörs i PlannerPage via lib/maskinSom.
//
// Suspense-fallbacken är HELSVART (ingen logga, ingen text): useSearchParams() gör att den statiska HTML:en
// bara innehåller fallbacken, så det första som ritas är svart — aldrig planeringsvyn. Loggan visas
// bara i felskärmarna (ej behörig / okänd maskin / laddning fastnar).

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PlannerPage from '../planering/page';
import { MaskinSomContext } from '@/lib/maskinSomContext';
import { MASKIN_SOM_PARAM } from '@/lib/maskinSom';
import { StartSvartSkarm } from '@/components/maskin/StartSkarmar';

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
    <Suspense fallback={<StartSvartSkarm />}>
      <MaskinInnehall />
    </Suspense>
  );
}
