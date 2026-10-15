'use client';

// Delar som objektkortet, Om trakten och Mer har gemensamt: sidhuvudet (namn + × eller ‹ tillbaka), versal sektionsrubrik och en tryckrad.
// Bara tokens (lib/design/tokens) — inga egna storlekar, färger eller avstånd.

import React from 'react';
import { AVSTAND, FARG, IKON, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';

export const Kryss = () => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={FARG.text2} strokeWidth="2.6" strokeLinecap="round"><path d="M6 6 L18 18" /><path d="M18 6 L6 18" /></svg>
);
export const Pil = ({ vanster = false, farg }: { vanster?: boolean; farg?: string }) => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={farg ?? (vanster ? FARG.bla : FARG.text3)} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d={vanster ? 'M15 6 L9 12 L15 18' : 'M9 6 L15 12 L9 18'} />
  </svg>
);

/** Sidhuvudet. Kortet: namnet + ×. Om trakten och Mer: "‹ objektnamn" (tillbaka till kortet, blå eftersom det navigerar) + titel + ×. */
export function Huvud({ titel, undertitel, tillbaka, onTillbaka, onStang }: { titel: string; undertitel?: string; tillbaka?: string; onTillbaka?: () => void; onStang: () => void }) {
  return (
    <div style={{ flexShrink: 0, padding: `0 ${AVSTAND.l}px ${AVSTAND.s}px` }}>
      {tillbaka && onTillbaka && (
        <button type="button" data-testid="info-tillbaka" onClick={onTillbaka}
          style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, minHeight: TRAFFYTA.min, marginLeft: -AVSTAND.xs, padding: `0 ${AVSTAND.xs}px`, border: 'none', background: 'none', color: FARG.bla, fontFamily: 'inherit', cursor: 'pointer', maxWidth: '100%', ...TYP.text }}>
          <Pil vanster />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tillbaka}</span>
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: AVSTAND.m }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div data-testid="info-titel" style={{ ...TYP.rubrik, color: FARG.text, overflowWrap: 'anywhere' }}>{titel}</div>
          {undertitel && <div data-testid="info-undertitel" style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{undertitel}</div>}
        </div>
        <button type="button" aria-label="Stäng" data-testid="info-stang" onClick={onStang}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: TRAFFYTA.min, height: TRAFFYTA.min, marginTop: -AVSTAND.xs, marginRight: -AVSTAND.s, borderRadius: RADIE.cirkel, border: 'none', background: FARG.upphojt, cursor: 'pointer' }}>
          <Kryss />
        </button>
      </div>
    </div>
  );
}

/** Versal grupprubrik (TYP.micro). */
export const Rubrik = ({ children, farg }: { children: React.ReactNode; farg?: string }) => (
  <div style={{ ...TYP.micro, color: farg ?? FARG.text2, margin: `0 ${AVSTAND.xs}px ${AVSTAND.s}px` }}>{children}</div>
);

/** En tryckrad i ett kort: ikon, text (+ ev. rad under), valfritt innehåll till höger, pil. 56 px hög. */
export function RadKnapp({ ikon, etikett, under, hoger, onTryck, farg, testid, pil = true, forstaRad = false }: {
  ikon?: string; etikett: React.ReactNode; under?: React.ReactNode; hoger?: React.ReactNode; onTryck: () => void; farg?: string; testid?: string; pil?: boolean; forstaRad?: boolean;
}) {
  return (
    <button type="button" data-testid={testid} onClick={onTryck} className="press-row"
      style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none',
        borderTop: forstaRad ? 'none' : `1px solid ${FARG.linje}`, color: farg ?? FARG.text, ...TYP.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
      {ikon && <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, color: farg ?? FARG.text, flexShrink: 0, width: AVSTAND.xxl, textAlign: 'center' }}>{ikon}</span>}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', overflowWrap: 'anywhere' }}>{etikett}</span>
        {under && <span style={{ display: 'block', ...TYP.meta, color: FARG.text2, overflowWrap: 'anywhere' }}>{under}</span>}
      </span>
      {hoger}
      {pil && <Pil />}
    </button>
  );
}

/** Ett kort (grupp av rader). */
export const Gruppkort = ({ children, testid }: { children: React.ReactNode; testid?: string }) => (
  <div data-testid={testid} style={{ background: FARG.upphojt, borderRadius: RADIE.kort, overflow: 'hidden' }}>{children}</div>
);
