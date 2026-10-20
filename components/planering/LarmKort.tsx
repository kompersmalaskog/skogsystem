'use client';

// LARMKORTET i körvyn och skotarläget: ETT kort högst upp med namn och meter som räknas ner live. Ingen knapp — det försvinner av sig självt
// när man passerat eller lämnat ytan. Inom 15 m (bara Röd) pulserar det. Färgen kommer från larmmodulen (lib/larm/grupper), aldrig härifrån.
// Kvitteringen ("Sett <Namn>") är en smal rad längst ner (SettRad) — inte en knapp i kortet.

import React from 'react';
import type { LarmKort as Kort } from '@/lib/larm/larm';
import type { FargGrupp } from '@/lib/larm/grupper';
import { AVSTAND, FARG, RADIE, TYP, medSafeBotten } from '@/lib/design/tokens';

/** Ikonen följer gruppen (formen bär betydelsen när färgen inte syns i solljus). */
const IKON: Record<FargGrupp, string> = {
  fara: 'warning', natur: 'forest', kultur: 'museum', blott: 'water_drop', att_gora: 'content_cut', info: 'info',
};

export function LarmKortVy({ kort, riktning, top }: { kort: Kort; riktning: string | null; top: string }) {
  const rad2 = kort.text ?? (riktning && kort.avstandM != null ? riktning : null);
  return (
    <div style={{ position: 'fixed', left: AVSTAND.m, right: AVSTAND.m, top, zIndex: 620, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <style>{`@keyframes larmPuls { 0%,100% { box-shadow: 0 0 0 0 ${kort.farg}00, 0 16px 50px rgba(0,0,0,0.7); } 50% { box-shadow: 0 0 0 8px ${kort.farg}66, 0 16px 50px rgba(0,0,0,0.7); } } @media (prefers-reduced-motion: reduce) { [data-testid="larm-kort"] { animation: none !important; } }`}</style>
      <div
        role="alert"
        aria-live="assertive"
        data-testid="larm-kort"
        data-grupp={kort.grupp}
        data-pulserar={kort.pulserar ? 'ja' : 'nej'}
        data-forbjuden={kort.forbjuden ? 'ja' : 'nej'}
        style={{
          width: '100%', maxWidth: 560, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: AVSTAND.l, padding: `${AVSTAND.m}px ${AVSTAND.m}px ${AVSTAND.m}px ${AVSTAND.l}px`,
          background: FARG.kort, border: `3px solid ${kort.farg}`, borderRadius: RADIE.sheet, color: FARG.text, pointerEvents: 'auto',
          boxShadow: '0 16px 50px rgba(0,0,0,0.7)', animation: kort.pulserar ? 'larmPuls 0.9s ease-in-out infinite' : 'none',
        }}
      >
        <span aria-hidden="true" style={{ width: 52, height: 52, flexShrink: 0, borderRadius: RADIE.kort, background: kort.farg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 30, color: FARG.text }}>{kort.forbjuden ? 'block' : IKON[kort.grupp]}</span>
        </span>
        <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ ...TYP.rubrik, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kort.namn}</span>
          {rad2 && <span style={{ ...TYP.text, color: FARG.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rad2}</span>}
        </span>
        {kort.avstandM != null && (
          <span data-testid="larm-meter" style={{ flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 4, paddingRight: AVSTAND.s }}>
            <span style={{ ...TYP.tal }}>{kort.avstandM}</span>
            <span style={{ ...TYP.listtitel, color: FARG.text2 }}>m</span>
          </span>
        )}
      </div>
    </div>
  );
}

const PLUS_ZON_PX = 72;
const PLUS_OVER_PX = 20 + 44 + AVSTAND.s;

/** Den smala raden längst ner: "Sett <Namn>". Samma plats som kvittot (KorvyKvitto): bredvid plus-knappen, på telefon ovanför den. */
export function SettRad({ namn, farg, smal, onSett }: { namn: string; farg: string; smal: boolean; onSett: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', left: AVSTAND.s, right: smal ? AVSTAND.s : PLUS_ZON_PX, zIndex: 590, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        bottom: smal ? `calc(${PLUS_OVER_PX}px + env(safe-area-inset-bottom, 0px))` : medSafeBotten(AVSTAND.l + AVSTAND.xs),
      }}
    >
      <button
        type="button"
        data-testid="larm-sett"
        aria-label={`Kvittera ${namn}`}
        onClick={() => { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8); onSett(); }}
        className="press-dim"
        style={{
          pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', maxWidth: 520, minHeight: 56, boxSizing: 'border-box', padding: `0 ${AVSTAND.l}px`,
          border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet, background: FARG.kort, color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', ...TYP.listtitel,
        }}
      >
        <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 6, background: farg, flexShrink: 0 }} />
        <span style={{ flex: '1 1 auto', minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Sett {namn}</span>
        <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: 22, color: FARG.text2 }}>check</span>
      </button>
    </div>
  );
}
