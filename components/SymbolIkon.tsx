// En markeringssymbol i gränssnittet (meny, dock, kort, teckenförklaring, briefing): formen i gruppens färg med vit kant och glyfen —
// samma bild som på kartan. Allt kommer ur lib/symboler + lib/larm/grupper; ingen egen färg, form eller glyf här.

import React from 'react';
import { FORM_KANT_BREDD, FORM_PATH, GLYF_LINJE_BREDD, GLYF_TRANSFORM, SYMBOL_VIEWBOX, larmIkonDef, symbolDef, type SymbolDef } from '@/lib/symboler';
import type { FargGrupp } from '@/lib/larm/grupper';

export function SymbolIkon({ typ, storlek = 36, kant = '#ffffff', titel }: { typ: string | null | undefined; storlek?: number; kant?: string; titel?: string }) {
  return <FormIkon d={symbolDef(typ)} storlek={storlek} kant={kant} titel={titel} />;
}

/** Larmkortets ikon: för en symbol exakt kartans bild; för en linje/yta/Vidas lager gruppens form och färg med den betydelsebärande glyfen. */
export function LarmIkon({ kalla, typ, grupp, storlek = 52, kant = '#ffffff' }: { kalla: 'symbol' | 'linje' | 'yta'; typ: string | null | undefined; grupp: FargGrupp; storlek?: number; kant?: string }) {
  return <FormIkon d={larmIkonDef(kalla, typ, grupp)} storlek={storlek} kant={kant} />;
}

function FormIkon({ d, storlek, kant, titel }: { d: SymbolDef; storlek: number; kant: string; titel?: string }) {
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
