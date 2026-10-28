'use client';

// PASSAGE PÅ PLANERAD VÄG (Martin 2026-10-28): maskinen står på en planerad basväg/stickväg inne i en förbjuden yta → inget larmkort, inget ljud, bara den här lilla
// raden högst upp: "Passage genom [Hänsyn 6]". Samma plats och samma bricka som påminnelsen i ytan (YtaPaminnelse). Ingen knapp. Försvinner när maskinen lämnat ytan;
// kör den av vägen kommer det riktiga larmkortet (lib/larm/passage, lib/larm/larm `arPassage`).

import React from 'react';
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import type { LarmPassage } from '@/lib/larm/larm';
import { passageText } from '@/lib/larm/passage';
import { YtaBricka } from './YtaRad';

export function PassageRad({ passage, top }: { passage: LarmPassage; top: string }) {
  return (
    <div style={{ position: 'fixed', left: AVSTAND.m, right: AVSTAND.m, top, zIndex: 615, display: 'flex', justifyContent: 'flex-start', pointerEvents: 'none' }}>
      <div
        role="status"
        data-testid="larm-passage"
        data-id={passage.id}
        aria-label={passageText(passage.namn)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s, maxWidth: '100%', minHeight: TRAFFYTA.min, boxSizing: 'border-box',
          padding: `${AVSTAND.xs}px ${AVSTAND.xs}px ${AVSTAND.xs}px ${AVSTAND.m}px`, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet,
          background: FARG.kort, color: FARG.text, ...TYP.text, whiteSpace: 'nowrap', boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
        }}
      >
        <span>Passage genom</span>
        <YtaBricka bricka={passage.namn} grupp={passage.grupp} testid="larm-passage-bricka" />
      </div>
    </div>
  );
}
