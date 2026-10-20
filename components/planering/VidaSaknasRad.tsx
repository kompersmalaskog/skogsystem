'use client';

// Raden i körvyn och skotarläget när Vidas lager (kraftledning, hänsynsytor, traktgräns, avlägg) inte gick att hämta. Ligger direkt under objektpillen,
// där larmkortet annars står (larmkortet flyttas ned med `VIDA_RAD_HOJD_PX`). Ren information, ingen knapp — den försvinner när lagren laddats.

import React from 'react';
import { VIDA_SAKNAS_TEXT } from '@/lib/larm/vidaLager';
import { AVSTAND, FARG, RADIE, TYP } from '@/lib/design/tokens';

/** Radens höjd: larmkortet läggs under den. */
export const VIDA_RAD_HOJD_PX = 48;

export function VidaSaknasRad({ top }: { top: string }) {
  return (
    <div style={{ position: 'fixed', left: AVSTAND.m, right: AVSTAND.m, top, zIndex: 621, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div
        role="status"
        data-testid="vida-saknas-rad"
        style={{
          boxSizing: 'border-box', width: '100%', maxWidth: 560, minHeight: VIDA_RAD_HOJD_PX, display: 'flex', alignItems: 'center', gap: AVSTAND.s,
          padding: `${AVSTAND.s}px ${AVSTAND.m}px`, background: FARG.kort, border: `2px solid ${FARG.orange}`, borderRadius: RADIE.sheet, color: FARG.text, ...TYP.text,
        }}
      >
        <span aria-hidden="true" style={{ width: AVSTAND.m, height: AVSTAND.m, borderRadius: RADIE.cirkel, background: FARG.orange, flexShrink: 0 }} />
        <span>{VIDA_SAKNAS_TEXT}</span>
      </div>
    </div>
  );
}
