'use client';

// KVITTO NERTILL: "Högstubbe satt — Ångra" i 5 s efter en markering, eller ett felkvitto (orange) när markeringen inte kunde sättas
// (ingen/gammal position). Samma placering som den smala listen (KorvyNertillList): bredvid plus-knappen, på telefon ovanför den.
// Via designtokens. Ligger under plusraden (z 640/650) men över kartan.

import React from 'react';
import { AVSTAND, FARG, RADIE, TYP, medSafeBotten } from '@/lib/design/tokens';

const HOJD_PX = 56;
const KNAPP_HOJD_PX = 48;
const PLUS_ZON_PX = 72;
const PLUS_OVER_PX = 20 + 44 + AVSTAND.s;

export function KorvyKvitto({ text, ton, onAngra, smal }: { text: string; ton: 'ok' | 'fel'; onAngra?: () => void; smal: boolean }) {
  const fel = ton === 'fel';
  return (
    <div
      data-testid="korvy-kvitto-ram"
      style={{
        position: 'fixed', left: AVSTAND.s, right: smal ? AVSTAND.s : PLUS_ZON_PX, zIndex: 600, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        bottom: smal ? `calc(${PLUS_OVER_PX}px + env(safe-area-inset-bottom, 0px))` : medSafeBotten(AVSTAND.l + AVSTAND.xs),
      }}
    >
      <div
        role="status"
        aria-live="polite"
        data-testid="korvy-kvitto"
        data-ton={ton}
        style={{
          pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: AVSTAND.s, maxWidth: 520, boxSizing: 'border-box', minHeight: HOJD_PX,
          padding: onAngra ? `0 ${AVSTAND.s}px 0 ${AVSTAND.l}px` : `0 ${AVSTAND.l}px`, borderRadius: RADIE.sheet,
          background: fel ? FARG.orange : FARG.kort, color: fel ? FARG.bg : FARG.text, border: fel ? 'none' : `1px solid ${FARG.linje}`,
          fontFamily: 'inherit', ...TYP.listtitel,
        }}
      >
        <span style={{ flex: '1 1 auto', minWidth: 0 }}>{text}</span>
        {onAngra && (
          <button
            type="button"
            data-testid="korvy-kvitto-angra"
            onClick={onAngra}
            className="press-dim"
            style={{
              flexShrink: 0, height: KNAPP_HOJD_PX, minWidth: 88, padding: `0 ${AVSTAND.l}px`, border: 'none', borderRadius: RADIE.knapp,
              background: FARG.fyllning, color: FARG.text, fontFamily: 'inherit', ...TYP.listtitel, cursor: 'pointer',
            }}
          >
            Ångra
          </button>
        )}
      </div>
    </div>
  );
}
