'use client';

// ObjektInfo = ramen (ark/panel) + de tre vyerna: kortet, Om trakten och Mer. Vilken vy som visas är komponentens eget tillstånd och börjar
// på kortet vid varje öppning. "Läs allt ›" och raden På trakten öppnar Om trakten; Mer-knappen öppnar Mer; ‹ tar tillbaka till kortet.
// Allt annat (vad en knapp GÖR, vad kartan gör) avgör sidan via callbacks.

import React, { useEffect, useState } from 'react';
import { useSkarmLage } from '@/lib/hooks/useSkarmLage';
import InfoRam, { type InfoVy } from './InfoRam';
import ObjektKort, { type ObjektKortProps } from './ObjektKort';
import OmTrakten, { type OmTraktenProps } from './OmTrakten';
import MerMeny, { type MerMenyProps } from './MerMeny';
import type { KartMarkering, KortKnappId } from '@/lib/objektKort';
import type { PlusLage } from '@/lib/plusArk';
import type { SlappOrsak } from '@/lib/omTraktenFramhav';

export interface ObjektInfoProps {
  oppen: boolean;
  onStang: () => void;
  objektNamn: string;
  /** objektets id — Om trakten använder det för att hitta foton som väntar på uppladdning */
  objektId: string | null;
  /** en knapp på kortet utom Mer (Mer öppnar Mer-vyn här) */
  onKnapp: (id: Exclude<KortKnappId, 'mer'>) => void;
  kort: Omit<ObjektKortProps, 'namn' | 'onStang' | 'onKnapp' | 'onLasAllt' | 'onPaTrakten'>;
  /** onVisa får även ramens läge: telefon stänger arket och flyger dit, bred skärm lämnar panelen */
  om: Omit<OmTraktenProps, 'objektNamn' | 'objektId' | 'onTillbaka' | 'onStang' | 'onVisa' | 'onSlapp'> & { onVisa: (m: KartMarkering, lage: PlusLage) => void; onSlapp: (orsak: SlappOrsak) => void };
  /** vilken vy som visas när ramen öppnas ('om' = telefonens "‹ Om trakten" tillbaka till listan); standard kortet */
  startVy?: InfoVy;
  mer: Omit<MerMenyProps, 'objektNamn' | 'onTillbaka' | 'onStang'>;
}

export default function ObjektInfo({ oppen, onStang, objektNamn, objektId, onKnapp, kort, om, mer, startVy = 'kort' }: ObjektInfoProps) {
  const [vy, setVy] = useState<InfoVy>(startVy);
  const ramLage = useSkarmLage(oppen);
  // Varje öppning börjar på kortet (eller på Om trakten när sidan ber om det).
  useEffect(() => { if (oppen) setVy(startVy); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppen]);
  // Bred skärm: panelen ligger kvar medan en markering är framhävd. Stängs Om trakten (×, Esc eller ‹ tillbaka) lämnas framhävningen. På telefon stänger
  // "Visa ›" arket SJÄLV — det är inte en stängning att reagera på, så där släpps den först av kartan, raden eller "‹ Om trakten".
  const stangOm = () => { if (vy === 'om' && ramLage === 'panel') om.onSlapp('stang'); };
  const stangRam = () => { stangOm(); onStang(); };

  return (
    <InfoRam oppen={oppen} vy={vy} ariaLabel={vy === 'kort' ? 'Objektinfo' : vy === 'om' ? 'Om trakten' : 'Mer'} onStang={stangRam}>
      {({ lage }) => (
        vy === 'kort' ? (
          <ObjektKort {...kort} namn={objektNamn} onStang={stangRam}
            onKnapp={(id) => { if (id === 'mer') setVy('mer'); else onKnapp(id); }}
            onLasAllt={() => setVy('om')} onPaTrakten={() => setVy('om')} />
        ) : vy === 'om' ? (
          <OmTrakten {...om} onVisa={(m) => om.onVisa(m, lage)} onSlapp={() => om.onSlapp('rad')} objektNamn={objektNamn} objektId={objektId} onTillbaka={() => { stangOm(); setVy('kort'); }} onStang={stangRam} />
        ) : (
          <MerMeny {...mer} objektNamn={objektNamn} onTillbaka={() => setVy('kort')} onStang={stangRam} />
        )
      )}
    </InfoRam>
  );
}
