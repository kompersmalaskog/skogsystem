'use client';

// Kvittot efter en sparning: EN rad nertill i några sekunder ("Tog 1 · 6 kvar"). Ingen dialog, inget att stänga.

import { useEffect } from 'react';
import { AVSTAND, FARG, KOLUMN, RADIE, TYP, medSafeBotten } from '@/lib/design/tokens';

export const KVITTO_MS = 4000;

export default function Kvitto({ text, onBorta }: { text: string | null; onBorta: () => void }) {
  useEffect(() => {
    if (!text) return;
    const t = window.setTimeout(onBorta, KVITTO_MS);
    return () => window.clearTimeout(t);
  }, [text, onBorta]);

  if (!text) return null;
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: `0 ${AVSTAND.sidmarginal}px ${medSafeBotten(AVSTAND.l)}`, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 1500 }}>
      <div role="status" className="tona-in" data-testid="kvitto"
        style={{ maxWidth: KOLUMN.ark, background: FARG.upphojt, color: FARG.text, borderRadius: RADIE.kort, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, ...TYP.text }}>
        {text}
      </div>
    </div>
  );
}
