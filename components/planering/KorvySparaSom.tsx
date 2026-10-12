'use client';

// "SPARA SOM …" — efter Klar i Mät/Rita. En rad stora val; valet sparas som en vanlig markering (lib/sparSom) som alla på objektet ser.
// Tillbaka går tillbaka till ritningen (punkterna finns kvar), Kasta slänger figuren lokalt. Via designtokens.

import React from 'react';
import { AVSTAND, FARG, RADIE, TNUM, TYP, medSafeBotten } from '@/lib/design/tokens';
import type { SparSomVal } from '@/lib/sparSom';

export function KorvySparaSom({ mattText, val, smal, onVal, onTillbaka, onKasta }: {
  /** figurens mått, t.ex. "0,89 ha" */
  mattText: string;
  val: SparSomVal[];
  smal: boolean;
  onVal: (id: string) => void;
  onTillbaka: () => void;
  onKasta: () => void;
}) {
  return (
    <>
      <div data-testid="spara-som-bakgrund" style={{ position: 'fixed', inset: 0, background: FARG.bg, opacity: 0.45, zIndex: 640 }} />
      <div
        role="dialog"
        aria-label="Spara som"
        data-testid="spara-som"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 650, boxSizing: 'border-box', background: FARG.kort, color: FARG.text, fontFamily: 'inherit',
          borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`, padding: `${AVSTAND.l}px ${AVSTAND.l}px`, paddingBottom: medSafeBotten(AVSTAND.l),
          display: 'flex', flexDirection: 'column', gap: AVSTAND.m, maxHeight: '88vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: AVSTAND.m }}>
          <span style={{ ...TYP.rubrik }}>Spara som</span>
          <span data-testid="spara-som-matt" style={{ ...TYP.listtitel, color: FARG.text2, ...TNUM }}>{mattText}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: smal ? 'repeat(2, minmax(0, 1fr))' : `repeat(${Math.min(4, Math.max(2, val.length))}, minmax(0, 1fr))`, gap: AVSTAND.s }}>
          {val.map((v) => (
            <button
              key={v.id}
              type="button"
              data-testid={`spara-som-${v.id}`}
              onClick={() => onVal(v.id)}
              className="press-scale"
              style={{
                minHeight: 72, padding: AVSTAND.m, border: 'none', borderRadius: RADIE.knapp, background: FARG.upphojt, color: FARG.text, fontFamily: 'inherit',
                cursor: 'pointer', touchAction: 'manipulation', ...TYP.listtitel,
              }}
            >
              {v.etikett}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.m }}>
          <button type="button" data-testid="spara-som-tillbaka" onClick={onTillbaka}
            style={{ minHeight: 56, minWidth: 56, border: 'none', background: 'none', color: FARG.bla, fontFamily: 'inherit', cursor: 'pointer', ...TYP.text }}>‹ Tillbaka till ritningen</button>
          <button type="button" data-testid="spara-som-kasta" onClick={onKasta}
            style={{ minHeight: 56, minWidth: 56, border: 'none', background: 'none', color: FARG.text2, fontFamily: 'inherit', cursor: 'pointer', ...TYP.text }}>Kasta</button>
        </div>
      </div>
    </>
  );
}
