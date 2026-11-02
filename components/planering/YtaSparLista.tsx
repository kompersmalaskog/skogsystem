'use client';

// Spåra med GPS › Ytor: en rad per yta (samma färg som ytan) och sist Nytt område (traktgräns). Ett tryck startar spårningen;
// man går runt ytan och Klar sluter den (lib/gpsSparYta). Samma rader som linjelistan ovanför (LinjeTypLista).

import React from 'react';
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';

export interface YtaTyp { id: string; name: string; color: string }

export function YtaSparLista({ ytor, omradeFarg, onYta, onOmrade }: { ytor: readonly YtaTyp[]; omradeFarg: string; onYta: (id: string) => void; onOmrade: () => void }) {
  const rad = (id: string, namn: string, farg: string, onTryck: () => void, testid: string) => (
    <div key={id} role="button" tabIndex={0} data-testid={testid} onClick={onTryck}
      style={{ minHeight: TRAFFYTA.primar, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.l, borderRadius: RADIE.rad, cursor: 'pointer' }}>
      <div aria-hidden="true" style={{ width: AVSTAND.xxl * 2, height: AVSTAND.l, borderRadius: AVSTAND.xs, flexShrink: 0, background: farg, opacity: 0.85 }} />
      <span style={{ ...TYP.text, color: FARG.text }}>{namn}</span>
    </div>
  );
  return (
    <div data-testid="yta-spar-lista" style={{ padding: `0 ${AVSTAND.m}px ${AVSTAND.m}px` }}>
      <div style={{ ...TYP.micro, color: FARG.text2, padding: `${AVSTAND.s}px ${AVSTAND.xs}px` }}>Gå runt en yta</div>
      <div style={{ background: FARG.bg, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet, padding: AVSTAND.s }}>
        {ytor.map((y) => rad(y.id, y.name, y.color, () => onYta(y.id), `yta-spar-${y.id}`))}
        {rad('omrade', 'Nytt område (traktgräns)', omradeFarg, onOmrade, 'yta-spar-omrade')}
      </div>
    </div>
  );
}
