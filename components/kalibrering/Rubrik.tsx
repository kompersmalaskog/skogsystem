'use client';
// Flikens huvud: maskinvalet ("Giant ▾") och, under det, en liten rad som säger vad fliken svarar på. Samma form på Läget, Över tid och Kontroller.
import type { ReactNode } from 'react';
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import MaskinMeny from './MaskinMeny';

export default function Rubrik({ d, fraga, children }: { d: KalibreringData; /** Frågan fliken svarar på, liten text under maskinen. */ fraga?: string; children?: ReactNode }) {
  return (
    <header style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.l}px` }}>
      <MaskinMeny maskiner={d.aktivaMaskiner} valdId={d.effektiv} onVal={d.setValdMaskin} />
      {fraga && <div style={{ ...TYP.meta, color: FARG.text2 }}>{fraga}</div>}
      {children}
    </header>
  );
}
