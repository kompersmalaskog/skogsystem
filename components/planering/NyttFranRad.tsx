'use client';

// "Nytt från Martin: Varning – Torrträd, 120 m": EN rad överst i körvyn när någon annan lagt till eller ändrat något på objektet (lib/nyttFranPlaneraren).
// Ligger direkt under objektpillen (efter "Vidas lager saknas"); larmkortet och instruktionskortet flyttas ned med `NYTT_RAD_HOJD_PX`. Hela raden är en knapp: tryck = kartan visar
// ändringen. Ingen kvittering, inget ljud. Ton: röd = fara, gul = Viktigt, annars neutral (ordet i texten bär betydelsen, färgen förstärker).

import React from 'react';
import { AVSTAND, FARG, RADIE, TYP } from '@/lib/design/tokens';
import type { NyttTon } from '@/lib/nyttFranPlaneraren';

/** Radens höjd: korten under läggs efter den. */
/** Fast höjd (två textrader ryms): korten under flyttas ned lika mycket vare sig texten är kort eller lång, så inget hoppar. */
export const NYTT_RAD_HOJD_PX = 64;

const TON: Record<NyttTon, { bg: string; fg: string; kant: string }> = {
  fara: { bg: FARG.rod, fg: FARG.text, kant: FARG.rod },
  viktigt: { bg: FARG.orange, fg: FARG.bg, kant: FARG.orange },
  neutral: { bg: FARG.kort, fg: FARG.text, kant: FARG.linje },
};

export function NyttFranRad({ text, ton, antal, onTryck, top }: { text: string; ton: NyttTon; antal: number; onTryck: () => void; top: string }) {
  const t = TON[ton];
  return (
    <div style={{ position: 'fixed', left: AVSTAND.m, right: AVSTAND.m, top, zIndex: 622, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <button
        type="button"
        role="status"
        aria-live="polite"
        data-testid="nytt-fran-rad"
        data-ton={ton}
        data-antal={antal}
        onClick={onTryck}
        className="press-dim"
        style={{
          pointerEvents: 'auto', boxSizing: 'border-box', width: '100%', maxWidth: 560, height: NYTT_RAD_HOJD_PX, display: 'flex', alignItems: 'center', gap: AVSTAND.s,
          padding: `${AVSTAND.s}px ${AVSTAND.m}px`, background: t.bg, color: t.fg, border: `1px solid ${t.kant}`, borderRadius: RADIE.sheet, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', ...TYP.listtitel,
        }}
      >
        <span data-testid="nytt-fran-text" style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.25 }}>{text}</span>
        <span aria-hidden="true" style={{ flexShrink: 0, opacity: 0.7 }}>›</span>
      </button>
    </div>
  );
}
