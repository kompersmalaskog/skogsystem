'use client';

// Planeringsvyn och maskinläget när INGET objekt är valt (första gången, objektet borttaget, eller Byt objekt på maskindatorn): kartan med alla objekt som prickar (lib/objektKarta —
// samma regler som när listan öppnas ovanpå ett objekt) och objektlistan ovanpå som vanligt (panel på bred skärm, ark på telefon). Aldrig en
// svart tom yta. Listan går inte att stänga i det här läget (inget objekt att gå tillbaka till), men kartan syns och prickarna går att trycka på:
// tryck = samma som raden i listan. Kartan går att använda fritt (panorera, nyp, dubbeltryck-zoom); tryck på tom karta gör ingenting.
//
// Egen liten karta (baskartan + prickarna) i stället för planeringsvyns 22 000-radiga: det finns inget objekt att rita lager för, och sidan
// byter till den vanliga kartan i samma stund ett objekt valts.

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import ObjektLista, { type ListaObjekt, type ObjektListaProps } from './ObjektLista';
import { useObjektPrickar } from '@/lib/hooks/useObjektPrickar';
import { TOM_KARTA_START, tomKartaStil, type KartPrickar } from '@/lib/objektKarta';
import { STANDARD_KARTLAGER, type Kartlager } from '@/lib/kartlager';
import { FARG } from '@/lib/design/tokens';

const MapLibreMap = dynamic(() => import('@/components/MapLibreMap'), { ssr: false });

export default function ObjektKartaTom({ onValj, onNavigera, maskin, kartlager = STANDARD_KARTLAGER, kartlagerStyrka }: { onValj: (o: ListaObjekt) => void; onNavigera: (o: ListaObjekt) => void; maskin?: ObjektListaProps['maskin']; kartlager?: Kartlager; kartlagerStyrka?: number }) {
  const [karta, setKarta] = useState<any | null>(null);
  const [prickar, setPrickar] = useState<KartPrickar | null>(null);
  // Samma bakgrundskarta som planeringsvyn (användarens sparade kartlager). Kartan byggs om bara när lagret byts.
  const stil = useMemo(() => tomKartaStil(kartlager, kartlagerStyrka), [kartlager, kartlagerStyrka]);
  useObjektPrickar({ map: karta, aktiv: true, prickar, aterstall: false });
  return (
    <>
      <div data-testid="planering-utan-objekt-karta" style={{ position: 'fixed', inset: 0, background: FARG.bg }}>
        <MapLibreMap
          onMapReady={setKarta}
          onMapRemoved={() => setKarta(null)}
          initialCenter={TOM_KARTA_START.center}
          initialZoom={TOM_KARTA_START.zoom}
          mapStyle={stil as any}
          style={{ position: 'absolute', inset: 0 }}
        />
      </div>
      <ObjektLista oppen kanStangas={false} valtId={null} onValj={onValj} onNavigera={onNavigera} onStang={() => {}} onPrickar={setPrickar} kartaTryck maskin={maskin} />
    </>
  );
}
