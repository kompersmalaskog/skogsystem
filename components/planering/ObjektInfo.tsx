'use client';

// ObjektInfo = ramen (ark/panel) + de tre vyerna: kortet, Om trakten och Mer. Vilken vy som visas är komponentens eget tillstånd och börjar
// på kortet vid varje öppning. "Läs allt ›" och raden På trakten öppnar Om trakten; Mer-knappen öppnar Mer; ‹ tar tillbaka till kortet.
// Allt annat (vad en knapp GÖR, vad kartan gör) avgör sidan via callbacks.

import React, { useEffect, useState } from 'react';
import InfoRam, { type InfoVy } from './InfoRam';
import ObjektKort, { type ObjektKortProps } from './ObjektKort';
import OmTrakten, { type OmTraktenProps } from './OmTrakten';
import MerMeny, { type MerMenyProps } from './MerMeny';
import type { KartMarkering, KortKnappId } from '@/lib/objektKort';
import type { PlusLage } from '@/lib/plusArk';

export interface ObjektInfoProps {
  oppen: boolean;
  onStang: () => void;
  objektNamn: string;
  /** en knapp på kortet utom Mer (Mer öppnar Mer-vyn här) */
  onKnapp: (id: Exclude<KortKnappId, 'mer'>) => void;
  kort: Omit<ObjektKortProps, 'namn' | 'onStang' | 'onKnapp' | 'onLasAllt' | 'onPaTrakten'>;
  /** onVisa får även ramens läge: telefon stänger arket och flyger dit, bred skärm lämnar panelen */
  om: Omit<OmTraktenProps, 'objektNamn' | 'onTillbaka' | 'onStang' | 'onVisa'> & { onVisa: (m: KartMarkering, lage: PlusLage) => void };
  mer: Omit<MerMenyProps, 'objektNamn' | 'onTillbaka' | 'onStang'>;
}

export default function ObjektInfo({ oppen, onStang, objektNamn, onKnapp, kort, om, mer }: ObjektInfoProps) {
  const [vy, setVy] = useState<InfoVy>('kort');
  // Varje öppning börjar på kortet.
  useEffect(() => { if (oppen) setVy('kort'); }, [oppen]);

  return (
    <InfoRam oppen={oppen} vy={vy} ariaLabel={vy === 'kort' ? 'Objektinfo' : vy === 'om' ? 'Om trakten' : 'Mer'} onStang={onStang}>
      {({ lage }) => (
        vy === 'kort' ? (
          <ObjektKort {...kort} namn={objektNamn} onStang={onStang}
            onKnapp={(id) => { if (id === 'mer') setVy('mer'); else onKnapp(id); }}
            onLasAllt={() => setVy('om')} onPaTrakten={() => setVy('om')} />
        ) : vy === 'om' ? (
          <OmTrakten {...om} onVisa={(m) => om.onVisa(m, lage)} objektNamn={objektNamn} onTillbaka={() => setVy('kort')} onStang={onStang} />
        ) : (
          <MerMeny {...mer} objektNamn={objektNamn} onTillbaka={() => setVy('kort')} onStang={onStang} />
        )
      )}
    </InfoRam>
  );
}
