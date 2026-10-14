'use client';

// Planeringsvyn när INGET objekt är valt (första gången, eller objektet är borttaget): kartan med alla objekt som prickar (lib/objektKarta —
// samma regler som när listan öppnas ovanpå ett objekt) och objektlistan ovanpå som vanligt (panel på bred skärm, ark på telefon). Aldrig en
// svart tom yta. Listan går inte att stänga i det här läget (inget objekt att gå tillbaka till), men kartan syns och prickarna går att trycka på:
// tryck = samma som raden i listan. Kartan går att panorera och zooma. Tryck på tom karta gör ingenting.
//
// Egen liten karta (baskartan + prickarna) i stället för planeringsvyns 22 000-radiga: det finns inget objekt att rita lager för, och sidan
// byter till den vanliga kartan i samma stund ett objekt valts.

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import ObjektLista, { type ListaObjekt } from './ObjektLista';
import { useObjektPrickar } from '@/lib/hooks/useObjektPrickar';
import { TOM_KARTA_START, TOM_KARTA_STIL, type KartPrickar } from '@/lib/objektKarta';
import { FARG } from '@/lib/design/tokens';

const MapLibreMap = dynamic(() => import('@/components/MapLibreMap'), { ssr: false });

export default function ObjektKartaTom({ onValj, onNavigera }: { onValj: (o: ListaObjekt) => void; onNavigera: (o: ListaObjekt) => void }) {
  const [karta, setKarta] = useState<any | null>(null);
  const [prickar, setPrickar] = useState<KartPrickar | null>(null);
  useObjektPrickar({ map: karta, aktiv: true, prickar, kanStangas: false, onStang: () => {} });
  return (
    <>
      <div data-testid="planering-utan-objekt-karta" style={{ position: 'fixed', inset: 0, background: FARG.bg }}>
        <MapLibreMap
          onMapReady={setKarta}
          onMapRemoved={() => setKarta(null)}
          initialCenter={TOM_KARTA_START.center}
          initialZoom={TOM_KARTA_START.zoom}
          mapStyle={TOM_KARTA_STIL as any}
          style={{ position: 'absolute', inset: 0 }}
        />
      </div>
      <ObjektLista oppen kanStangas={false} valtId={null} onValj={onValj} onNavigera={onNavigera} onStang={() => {}} onPrickar={setPrickar} kartaTryck />
    </>
  );
}
