'use client';

// REDIGERA LINJER — EN list nertill (Martin 2026-10-25, skiss 47–48): Rita · Sudda · Förläng · Koppla ihop, plus Ångra och ✓ Klar. Inget mer.
// Raden ovanför knapparna säger i en mening vad nästa drag gör. Samma plats som övriga listor nertill (ovanför plusknappen på telefon), samma tokens.

import React from 'react';
import { AVSTAND, FARG, RADIE, TYP, medSafeBotten } from '@/lib/design/tokens';
import type { RedLage } from '@/lib/linjeRedigeringKarta';

export type RedVal = 'rita' | RedLage;

export const LINJERED_VAL: ReadonlyArray<{ id: RedVal; etikett: string }> = [
  { id: 'rita', etikett: 'Rita' },
  { id: 'sudda', etikett: 'Sudda' },
  { id: 'forlang', etikett: 'Förläng' },
  { id: 'koppla', etikett: 'Koppla ihop' },
];

/** Vad nästa drag gör — en kort mening per läge. */
export const LINJERED_TIPS: Record<RedLage, string> = {
  sudda: 'Dra över det som ska bort',
  forlang: 'Dra i en linjes ände',
  koppla: 'Dra en ände till en annan linje',
};

const KNAPP_H = 48;
const PLUS_OVER_PX = 20 + 44 + AVSTAND.s;   // samma som KorvyNertillList: plusknappens överkant + luft

export function LinjeRedList({ lage, onVal, onAngra, kanAngra, onKlar, smal, meddelande, testid = 'linjered-list' }: {
  lage: RedLage;
  /** Kort besked som ersätter tipset en stund (t.ex. att Vidas linjer bara planeraren kan ändra). */
  meddelande?: string | null;
  onVal: (v: RedVal) => void;
  onAngra: () => void;
  kanAngra: boolean;
  onKlar: () => void;
  smal: boolean;
  testid?: string;
}) {
  return (
    <div
      data-testid={testid}
      style={{
        position: 'fixed', left: AVSTAND.s, right: smal ? AVSTAND.s : 72, zIndex: 600, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        bottom: smal ? `calc(${PLUS_OVER_PX}px + env(safe-area-inset-bottom, 0px))` : medSafeBotten(AVSTAND.l + AVSTAND.xs),
      }}
    >
      <div
        role="status"
        style={{
          pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: AVSTAND.s, width: '100%', maxWidth: 560, boxSizing: 'border-box',
          padding: AVSTAND.s, background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet, color: FARG.text, fontFamily: 'inherit',
        }}
      >
        <div data-testid="linjered-tips" style={{ padding: `${AVSTAND.xs}px ${AVSTAND.s}px 0`, ...TYP.listtitel, color: meddelande ? FARG.orange : FARG.text }}>{meddelande || LINJERED_TIPS[lage]}</div>
        <div role="group" aria-label="Vad vill du göra med linjerna?" style={{ display: 'flex', gap: AVSTAND.xs }}>
          {LINJERED_VAL.map((v) => {
            const vald = v.id === lage;
            return (
              <button
                key={v.id}
                type="button"
                data-testid={`linjered-${v.id}`}
                aria-pressed={vald}
                onClick={() => onVal(v.id)}
                className="press-dim"
                style={{
                  flex: v.id === 'koppla' ? '1.5 1 0' : '1 1 0', minWidth: 0, height: KNAPP_H, padding: `0 ${AVSTAND.xs}px`, border: 'none', borderRadius: RADIE.knapp, fontFamily: 'inherit',
                  ...TYP.listtitel, cursor: 'pointer', whiteSpace: 'nowrap', background: vald ? FARG.text : FARG.fyllning, color: vald ? FARG.bg : FARG.text,
                }}
              >
                {v.etikett}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: AVSTAND.s }}>
          <button
            type="button"
            data-testid="linjered-angra"
            disabled={!kanAngra}
            onClick={onAngra}
            className="press-dim"
            style={{ flex: '1 1 0', height: KNAPP_H, border: 'none', borderRadius: RADIE.knapp, fontFamily: 'inherit', ...TYP.listtitel, cursor: kanAngra ? 'pointer' : 'default', opacity: kanAngra ? 1 : 0.4, background: FARG.fyllning, color: FARG.text }}
          >
            ↩ Ångra
          </button>
          <button
            type="button"
            data-testid="linjered-klar"
            aria-label="Klar"
            onClick={onKlar}
            className="press-dim"
            style={{ flex: '1 1 0', height: KNAPP_H, border: 'none', borderRadius: RADIE.knapp, fontFamily: 'inherit', ...TYP.listtitel, cursor: 'pointer', background: FARG.gron, color: FARG.bg }}
          >
            ✓ Klar
          </button>
        </div>
      </div>
    </div>
  );
}
