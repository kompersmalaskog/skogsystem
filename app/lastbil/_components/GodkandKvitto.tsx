'use client';

import { useEffect } from 'react';
import { AVSTAND, FARG, KNAPP, KOLUMN, RADIE, TYP, medSafeBotten } from '@/lib/design/tokens';

export const KVITTO_MS = 6000;

/**
 * "Godkänd · Giant — Ångra": ett tryck på Godkänn har ingen dialog, så ett felryck ska gå att ta
 * tillbaka (som Ta bort i planeringen). Står {KVITTO_MS} ms, sedan försvinner det av sig självt —
 * flytten ligger då hos faktureringen. Ångra lägger tillbaka den under "Att godkänna".
 */
export default function GodkandKvitto({ text, onAngra, onKlar }: { text: string; onAngra: () => void; onKlar: () => void }) {
  useEffect(() => {
    const t = setTimeout(onKlar, KVITTO_MS);
    return () => clearTimeout(t);
  }, [onKlar]);
  return (
    <div role="status" data-kvitto
      style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1500, display: 'flex', justifyContent: 'center', padding: `0 ${AVSTAND.l}px ${medSafeBotten(AVSTAND.l)}`, pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'auto', width: '100%', maxWidth: KOLUMN.ark, background: FARG.upphojt, borderRadius: RADIE.knapp, padding: `${AVSTAND.xs}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, boxSizing: 'border-box' }}>
        <span style={{ ...TYP.text, color: FARG.text }}>{text}</span>
        <button type="button" onClick={onAngra} style={KNAPP.lank}>Ångra</button>
      </div>
    </div>
  );
}
