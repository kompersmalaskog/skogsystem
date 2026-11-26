'use client';

// VÄDRET HAR SLAGIT OM — kortet högst upp i hytten på morgonen (lib/kalibrering/vaderHytt, hooken lib/hooks/useVaderHytt). Samma text som pushen, inga råd.
// Samma stil som riskkortet och instruktionskortet. Larm, lossning, besök och risker går före — det avgör sidan (lib/instruktioner/ordning `vaderKortLedigt`).

import React from 'react';
import { AVSTAND, FARG, RADIE, TYP, designCss } from '@/lib/design/tokens';
import type { VaderKort } from '@/lib/kalibrering/vaderHytt';
import { SettKnapp } from './InstruktionKort';

export default function VaderKortHytt({ kort, top, onSett }: { kort: VaderKort; top: string; onSett: () => void }) {
  return (
    <div style={{ position: 'fixed', left: AVSTAND.m, right: AVSTAND.m, top, zIndex: 620, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <style>{designCss}</style>
      <div
        role="status"
        data-testid="vader-kort"
        style={{
          width: '100%', maxWidth: 560, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.m}px ${AVSTAND.m}px ${AVSTAND.l}px`,
          background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet, color: FARG.text, pointerEvents: 'auto',
          boxShadow: '0 16px 50px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, paddingRight: AVSTAND.s }}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 28, color: FARG.orange, flexShrink: 0 }}>device_thermostat</span>
          <div data-testid="vader-kort-rubrik" style={{ ...TYP.rubrik, overflowWrap: 'anywhere' }}>{kort.titel}</div>
        </div>
        <div data-testid="vader-kort-text" style={{ ...TYP.kommentar, color: FARG.text, paddingRight: AVSTAND.s, overflowWrap: 'anywhere' }}>{kort.text}</div>
        <div style={{ paddingRight: AVSTAND.s }}>
          <SettKnapp testid="vader-kort-sett" onSett={onSett} />
        </div>
      </div>
    </div>
  );
}
