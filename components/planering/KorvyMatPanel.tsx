'use client';

// KÖRVYNS MÄTPANEL — stora knappar (56 px) för handskar. Samma mätning som planeringsvyns (lib/geoMat), annan panel:
//   • punkter    — "Mät sträcka" (tryck punkter, meter live) och "Mät yta" (tryck hörn, ha live)
//   • kor-vilar  — "Mät genom att köra": tryck Start …
//   • kor-spelar — … kör, meter live … Stopp
//   • resultat   — måttet står kvar på kartan: Spara eller Kasta
//   • sparad     — liten rad med det sparade måttet + Kasta

import React from 'react';

export type MatPanelLage = 'punkter' | 'kor-vilar' | 'kor-spelar' | 'resultat' | 'sparad';

const KNAPP: React.CSSProperties = {
  minHeight: 56, padding: '0 20px', borderRadius: 16, fontSize: 18, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', color: '#fff', flex: '1 1 auto',
};
const PRIMAR: React.CSSProperties = { ...KNAPP, border: 'none', background: '#30d158', color: '#0f1113' };

function Knapp({ etikett, onClick, primar, av, testid }: { etikett: string; onClick: () => void; primar?: boolean; av?: boolean; testid: string }) {
  return (
    <button
      type="button"
      data-testid={testid}
      disabled={av}
      onClick={onClick}
      className="press-dim"
      style={{ ...(primar ? PRIMAR : KNAPP), opacity: av ? 0.35 : 1, cursor: av ? 'default' : 'pointer' }}
    >
      {etikett}
    </button>
  );
}

export function KorvyMatPanel({
  lage, rubrik, live, hjalp, sekundar, kanAngra, kanKlar,
  onAngra, onKlar, onKasta, onSpara, onStart, onStopp,
}: {
  lage: MatPanelLage;
  rubrik: string;
  /** huvudmåttet live, t.ex. "384 m" / "0,31 ha" */
  live: string;
  hjalp?: string;
  /** extra rad, t.ex. "Yta 0,31 ha (slingan är stängd)" */
  sekundar?: string | null;
  kanAngra: boolean;
  kanKlar: boolean;
  onAngra: () => void;
  onKlar: () => void;
  onKasta: () => void;
  onSpara: () => void;
  onStart: () => void;
  onStopp: () => void;
}) {
  const ram: React.CSSProperties = {
    position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 84px)', left: '50%', transform: 'translateX(-50%)', zIndex: 300,
    width: 'min(460px, calc(100vw - 32px))', boxSizing: 'border-box', background: '#1c1f22', color: '#f2f2f2', borderRadius: 22,
    border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 10px 34px rgba(0,0,0,0.45)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
  };

  if (lage === 'sparad') {
    return (
      <div data-testid="korvy-matpanel" data-lage={lage} style={{ ...ram, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px 8px 18px' }}>
        <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 17 }}><span style={{ color: '#9aa0a6' }}>{rubrik} </span><b data-testid="korvy-matpanel-matt">{live}</b></span>
        <Knapp etikett="Kasta" onClick={onKasta} testid="korvy-mat-kasta" />
      </div>
    );
  }

  return (
    <div data-testid="korvy-matpanel" data-lage={lage} style={{ ...ram, padding: '14px 16px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 1.1, color: '#9aa0a6' }}>{rubrik.toUpperCase()}</div>
      <div data-testid="korvy-matpanel-matt" style={{ fontSize: 38, fontWeight: 500, margin: '4px 0 2px', fontVariantNumeric: 'tabular-nums' }}>{live}</div>
      {sekundar && <div data-testid="korvy-matpanel-sekundar" style={{ fontSize: 16, color: '#d4d8dd', marginBottom: 2 }}>{sekundar}</div>}
      {hjalp && <div style={{ fontSize: 14, color: '#7d838a', margin: '2px 0 10px' }}>{hjalp}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: hjalp ? 0 : 10 }}>
        {lage === 'punkter' && (<>
          <Knapp etikett="Ångra punkt" onClick={onAngra} av={!kanAngra} testid="korvy-mat-angra" />
          <Knapp etikett="Kasta" onClick={onKasta} testid="korvy-mat-kasta" />
          <Knapp etikett="Klar" onClick={onKlar} av={!kanKlar} primar testid="korvy-mat-klar" />
        </>)}
        {lage === 'kor-vilar' && (<>
          <Knapp etikett="Avbryt" onClick={onKasta} testid="korvy-mat-kasta" />
          <Knapp etikett="Start" onClick={onStart} primar testid="korvy-mat-start" />
        </>)}
        {lage === 'kor-spelar' && (
          <Knapp etikett="Stopp" onClick={onStopp} primar testid="korvy-mat-stopp" />
        )}
        {lage === 'resultat' && (<>
          <Knapp etikett="Kasta" onClick={onKasta} testid="korvy-mat-kasta" />
          <Knapp etikett="Spara" onClick={onSpara} primar testid="korvy-mat-spara" />
        </>)}
      </div>
    </div>
  );
}
