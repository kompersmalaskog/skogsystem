// En markeringssymbol i gränssnittet (meny, dock, kort, teckenförklaring, briefing): formen i gruppens färg med vit kant och glyfen —
// samma bild som på kartan. Allt kommer ur lib/symboler + lib/larm/grupper; ingen egen färg, form eller glyf här.

import React from 'react';
import { FORM_KANT_BREDD, FORM_PATH, GLYF_LINJE_BREDD, GLYF_TRANSFORM, SYMBOL_VIEWBOX, symbolDef } from '@/lib/symboler';

export function SymbolIkon({ typ, storlek = 36, kant = '#ffffff', titel }: { typ: string | null | undefined; storlek?: number; kant?: string; titel?: string }) {
  const d = symbolDef(typ);
  return (
    <svg width={storlek} height={storlek} viewBox={`0 0 ${SYMBOL_VIEWBOX} ${SYMBOL_VIEWBOX}`} style={{ display: 'block', flexShrink: 0 }} {...(titel ? { role: 'img', 'aria-label': titel } : { 'aria-hidden': true })} data-symbol={d.id} data-form={d.form}>
      <path d={FORM_PATH[d.form]} fill={d.farg} stroke={kant} strokeWidth={FORM_KANT_BREDD} strokeLinejoin="round" />
      <g transform={GLYF_TRANSFORM[d.form]}>
        <path d={d.glyf} fill="none" stroke="#ffffff" strokeWidth={GLYF_LINJE_BREDD} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** Bara glyfen (24 × 24) i valfri färg — för ställen som ritar egen bakgrund (listor, zonväljare). */
export function SymbolGlyf({ typ, storlek = 24, farg = '#ffffff', linje = GLYF_LINJE_BREDD }: { typ: string | null | undefined; storlek?: number; farg?: string; linje?: number }) {
  const d = symbolDef(typ);
  return (
    <svg width={storlek} height={storlek} viewBox="0 0 24 24" fill="none" stroke={farg} strokeWidth={linje} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <path d={d.glyf} />
    </svg>
  );
}
