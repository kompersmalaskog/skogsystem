'use client';

// RISKERNA I HYTTEN (Martin 2026-11-02): utan påminnelse kan en förare köra en hel trakt utan att öppna riskbedömningen. Därför kommer listan som ett kort
// högst upp när föraren öppnar körvyn på en trakt där planeraren godkänt riskerna och föraren inte läst just den listan. Kortet visar riskerna och vad man gör
// — inget att leta efter — och ligger kvar tills "Jag har läst". Det spärrar ingenting: kartan går att använda under.
// Bara de ALLVARLIGA riskerna står i kortet (AFS 2023:1 11 §, Martin 2026-11-05: mindre att läsa i hytten); hela listan finns i ⓘ. Sidan filtrerar.
// Samma stil som instruktionskortet (InstruktionKort). Larm, lossning och besök går före — det avgör sidan (lib/instruktioner/ordning `riskKortLedigt`).

import React from 'react';
import { AVSTAND, FARG, RADIE, TYP, designCss } from '@/lib/design/tokens';
import { riskAntalText, type Risk } from '@/lib/riskbedomning';
import { SettKnapp } from './InstruktionKort';

export default function RiskKortHytt({ risker, top, sparar, fel, onLast }: {
  risker: Risk[]; top: string; sparar: boolean; fel: boolean; onLast: () => void;
}) {
  return (
    <div style={{ position: 'fixed', left: AVSTAND.m, right: AVSTAND.m, top, zIndex: 620, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <style>{designCss}</style>
      <div
        role="alert"
        data-testid="risk-kort"
        style={{
          width: '100%', maxWidth: 560, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.m}px ${AVSTAND.m}px ${AVSTAND.l}px`,
          maxHeight: `calc(100dvh - ${top} - ${AVSTAND.xxl * 3}px)`, background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet, color: FARG.text, pointerEvents: 'auto',
          boxShadow: '0 16px 50px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: AVSTAND.s, paddingRight: AVSTAND.s }}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 28, color: FARG.orange, flexShrink: 0 }}>health_and_safety</span>
          <div style={{ minWidth: 0 }}>
            <div data-testid="risk-kort-rubrik" style={{ ...TYP.rubrik, overflowWrap: 'anywhere' }}>Risker på trakten</div>
            <div data-testid="risk-kort-under" style={{ ...TYP.text, color: FARG.text2 }}>{riskAntalText(risker.length)} · Läs innan du börjar</div>
          </div>
        </div>
        <div data-testid="risk-kort-lista" style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', gap: AVSTAND.s, paddingRight: AVSTAND.s }}>
          {risker.map((r) => (
            <div key={r.nyckel} data-testid={`risk-kort-${r.nyckel}`} style={{ background: FARG.upphojt, borderRadius: RADIE.kort, padding: `${AVSTAND.m}px ${AVSTAND.l}px` }}>
              <div style={{ ...TYP.listtitel, color: FARG.text, overflowWrap: 'anywhere' }}>{r.risk}</div>
              <div style={{ ...TYP.kommentar, color: FARG.text, marginTop: AVSTAND.xs, overflowWrap: 'anywhere' }}>{r.atgard}</div>
            </div>
          ))}
        </div>
        <div style={{ flexShrink: 0, paddingRight: AVSTAND.s }}>
          {sparar
            ? <div data-testid="risk-kort-sparar" style={{ ...TYP.listtitel, color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.l}px 0` }}>Sparar …</div>
            : <SettKnapp testid="risk-kort-las" etikett="Jag har läst" onSett={onLast} />}
          {fel && <div role="status" data-testid="risk-kort-fel" style={{ ...TYP.text, color: FARG.orange, marginTop: AVSTAND.s }}>Kunde inte spara. Försök igen.</div>}
        </div>
      </div>
    </div>
  );
}
