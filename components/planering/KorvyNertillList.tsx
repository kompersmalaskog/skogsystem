'use client';

// SMAL LIST NERTILL (max 72 px) — EN komponent för tre lägen i körvyn/planeringen:
//   • placera:  "Tryck där Högstubbe ska stå  ·  Vid maskinen  ·  ×"
//   • figur:    "0,89 ha  ·  Ångra  ·  Klar  ·  ×"            (Mät/Rita)
//   • prick:    "Högstubbe  ·  Ta bort  ·  ×"                 (tryck på en prick)
// Ligger bredvid plus-knappen på bred skärm; ovanför den på telefon (annars får texten ingen plats). Allt via designtokens.

import React from 'react';
import { AVSTAND, FARG, RADIE, TYP, medSafeBotten } from '@/lib/design/tokens';

export const LIST_HOJD_PX = 72;
const KNAPP_HOJD_PX = LIST_HOJD_PX - 2 * AVSTAND.s;     // 56
const PLUS_ZON_PX = 72;                                  // plus-knappen: 16 från kanten + 44 bred + 12 luft
const PLUS_OVER_PX = 20 + 44 + AVSTAND.s;                // plus-knappens överkant (20 + 44) + luft

export interface NertillKnapp {
  etikett: string;
  onClick: () => void;
  testid: string;
  primar?: boolean;
  destruktiv?: boolean;
  av?: boolean;
  /** Skärmläsarnamn när etiketten är en symbol (×). */
  aria?: string;
}

export function KorvyNertillList({ text, knappar, testid, smal, z = 600 }: {
  text: React.ReactNode;
  knappar: NertillKnapp[];
  testid: string;
  /** telefon: listen ligger ovanför plus-knappen och tar hela bredden */
  smal: boolean;
  z?: number;
}) {
  return (
    <div
      data-testid={testid}
      style={{
        position: 'fixed', left: AVSTAND.s, right: smal ? AVSTAND.s : PLUS_ZON_PX, zIndex: z, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        bottom: smal ? `calc(${PLUS_OVER_PX}px + env(safe-area-inset-bottom, 0px))` : medSafeBotten(AVSTAND.l + AVSTAND.xs),
      }}
    >
      <div
        role="status"
        style={{
          pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: AVSTAND.s, width: '100%', maxWidth: 560, boxSizing: 'border-box',
          height: LIST_HOJD_PX, padding: AVSTAND.s, background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet,
          color: FARG.text, fontFamily: 'inherit',
        }}
      >
        <div
          style={{
            flex: '1 1 auto', minWidth: 0, paddingLeft: AVSTAND.s, ...TYP.listtitel, overflow: 'hidden',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}
        >
          {text}
        </div>
        {knappar.map((k) => (
          <button
            key={k.testid}
            type="button"
            data-testid={k.testid}
            aria-label={k.aria}
            disabled={k.av}
            onClick={k.onClick}
            className="press-dim"
            style={{
              flexShrink: 0, height: KNAPP_HOJD_PX, minWidth: KNAPP_HOJD_PX, padding: `0 ${AVSTAND.m}px`, border: 'none', borderRadius: RADIE.knapp,
              fontFamily: 'inherit', ...TYP.listtitel, cursor: k.av ? 'default' : 'pointer', opacity: k.av ? 0.4 : 1,
              background: k.primar ? FARG.text : FARG.fyllning, color: k.primar ? FARG.bg : k.destruktiv ? FARG.rod : FARG.text,
            }}
          >
            {k.etikett}
          </button>
        ))}
      </div>
    </div>
  );
}

/** × som avbryt/kasta — samma knapp överallt. */
export const AVBRYT_KNAPP = (onClick: () => void, testid = 'nertill-avbryt'): NertillKnapp => ({ etikett: '×', onClick, testid, aria: 'Avbryt' });
