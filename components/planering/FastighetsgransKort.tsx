'use client';

// Kortet högst upp i körvyn när fastighetsgränsen ligger inom fällningscirkelns 30 m: "Fastighetsgräns 18 m" + "Fäll inte åt det hållet".
// Tyst — inget ljud, ingen kvittering, ingen knapp (som fällningscirkeln själv). Det ger vika för larmkortet, instruktionskortet och grindkortet (se sidan):
// cirkeln blir vit och streckad ändå. Stilen är grindkortets (samma plats, samma kort), symbolen är cirkelns egen: en vit streckad ring.

import React from 'react';
import { AVSTAND, FARG, RADIE, TYP } from '@/lib/design/tokens';
import { fastighetsFallText, type GransFall } from '@/lib/fastighetsgrans';

export const FASTIGHETSKORT_HOJD_PX = 52 + 2 * AVSTAND.m;

/** Den streckade ringen: samma som cirkeln på kartan (vit, streckad). */
export function StreckadRing({ storlek = 40 }: { storlek?: number }) {
  return (
    <svg width={storlek} height={storlek} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="15" fill="none" stroke="#ffffff" strokeWidth="3" strokeDasharray="6 5" />
    </svg>
  );
}

export function FastighetsgransKortVy({ fall, top }: { fall: GransFall; top: string }) {
  const t = fastighetsFallText(fall);
  return (
    <div style={{ position: 'fixed', left: AVSTAND.m, right: AVSTAND.m, top, zIndex: 610, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div
        role="status"
        data-testid="fastighetsgrans-kort"
        style={{
          width: '100%', maxWidth: 560, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: AVSTAND.l, padding: `${AVSTAND.m}px ${AVSTAND.l}px`,
          background: FARG.kort, borderRadius: RADIE.sheet, color: FARG.text, pointerEvents: 'auto', boxShadow: '0 16px 50px rgba(0,0,0,0.7)',
        }}
      >
        <span aria-hidden="true" style={{ flexShrink: 0, display: 'flex', width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}><StreckadRing storlek={44} /></span>
        <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          <span data-testid="fastighetsgrans-rubrik" style={{ ...TYP.rubrik }}>{t.rubrik}</span>
          <span style={{ ...TYP.text, color: FARG.text2 }}>{t.rad}</span>
        </span>
      </div>
    </div>
  );
}
