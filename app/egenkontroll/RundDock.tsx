'use client';

// DOCKAN: raden för det markerade (om något är markerat) och brickorna. Den ligger i arkets understa läge och syns alltid — i alla tre
// lägen står brickorna överst i arket, så man når dem utan att byta läge och utan att tappa kartan.
//
// AVSTEG 1/7 FRÅN PLANERINGSVYN: DOCKAN MED BRICKOR.
// Planeringsvyns dock (PlusRad) är en plats att välja en SYMBOL att sätta ut: den sparas per maskin, kan fästas och lossas och fylls efter
// vad man använder mest. Här finns ingenting att välja ut — rundan har en fast lista punkter (lib/egenkontrollBricka.ts, byggBrickor) och
// alla ska ligga framme, i samma ordning varje gång, så tummen lär sig var Körspår sitter. Därför: ett rutnät med tre kolumner (fyra ger
// ≈ 85 px per bricka på 390 px och trunkerar namnen; elva på fyra kolumner blir ojämnt), ingen docka som kan anpassas, ingen "Alla"-knapp.

import { AVSTAND, FARG, TYP } from '@/lib/design/tokens';
import type { ReactNode } from 'react';
import type { Bricka as BrickaData } from '@/lib/egenkontrollBricka';
import Bricka from './Bricka';

export type RundDockProps = {
  brickor: BrickaData[];
  markeradId: string | null;
  sparStatus: Record<string, boolean>;
  onTryck: (b: BrickaData) => void;
  /** Raden för det markerade (BrickaRad). Null = inget markerat. */
  rad: ReactNode | null;
  /** Visa hjälpraden: inget är besvarat än och inget markerat. */
  visaHjalp: boolean;
};

export default function RundDock({ brickor, markeradId, sparStatus, onTryck, rad, visaHjalp }: RundDockProps) {
  return (
    <div data-testid="rund-dock" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m, padding: `0 ${AVSTAND.l}px` }}>
      {rad}
      {visaHjalp && !rad && (
        <div role="note" style={{ ...TYP.meta, color: FARG.text2 }}>Tryck på en bricka ger Bra. Raden ändrar svaret.</div>
      )}
      {brickor.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: AVSTAND.s }}>
          {brickor.map((b) => (
            <Bricka key={b.id} bricka={b} markerad={markeradId === b.id} sparar={!!sparStatus[b.id]} onTryck={() => onTryck(b)} />
          ))}
        </div>
      )}
    </div>
  );
}
