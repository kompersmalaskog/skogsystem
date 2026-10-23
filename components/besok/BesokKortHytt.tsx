'use client';

// Besökskortet i hytten: ORANGE, högst upp — "Besök: Anna Svensson kommer ca 14:30", knapparna "Ring Anna" och "Uppfattat" (båda ≥ 56 px) och raden "Stäng av när du ser hen".
// Ligger kvar tills Uppfattat. Flera besök: det tidigaste visas, resten som "+N till". Ett ljud (hooken). Larm (fara) går före — det avgör sidan.

import React from 'react';
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { besokRubrik } from '@/lib/besok/status';
import { kommerText } from '@/lib/besok/tid';
import type { HyttBesok } from '@/lib/besok/hytt';

export const BESOK_KORT_MIN_KNAPP_PX = 56;

/** "Ring Anna" – förnamnet (kortet är smalt); saknas namn står bara "Ring". */
export const ringText = (namn: string): string => {
  const f = namn.trim().split(/\s+/)[0];
  return f ? `Ring ${f}` : 'Ring';
};

const KNAPP_STIL: React.CSSProperties = {
  flex: 1, minWidth: 0, minHeight: BESOK_KORT_MIN_KNAPP_PX, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
  padding: `0 ${AVSTAND.s}px`, border: 'none', borderRadius: RADIE.knapp, background: FARG.bg, color: FARG.text, ...TYP.listtitel, cursor: 'pointer',
  fontFamily: 'inherit', textDecoration: 'none', touchAction: 'manipulation', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

export default function BesokKortHytt({ besok, fler, sparar, fel, onUppfattat, onStangAv, top }: {
  besok: HyttBesok; fler: number; sparar: boolean; fel: string | null; onUppfattat: () => void; onStangAv: () => void; top: string;
}) {
  return (
    <div data-testid="besok-kort" role="alert" style={{ position: 'fixed', left: AVSTAND.m, right: AVSTAND.m, top, zIndex: 130, maxWidth: 520, margin: '0 auto', background: FARG.orange, color: FARG.bg, borderRadius: RADIE.kort, padding: AVSTAND.l }}>
      <div data-testid="besok-kort-rubrik" style={{ ...TYP.rubrik, overflowWrap: 'anywhere' }}>{besokRubrik(besok.namn, kommerText(besok.besokstid))}</div>
      {/* Numret är en KNAPP bredvid Uppfattat (ett tryck med handske) – inte en liten länk. */}
      <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.m }}>
        <a data-testid="besok-kort-ring" href={`tel:${besok.telefon.replace(/[^\d+]/g, '')}`} aria-label={`${ringText(besok.namn)} på ${besok.telefon}`} style={KNAPP_STIL}>{ringText(besok.namn)}</a>
        <button type="button" data-testid="besok-kort-uppfattat" onClick={onUppfattat} disabled={sparar} style={{ ...KNAPP_STIL, opacity: sparar ? 0.6 : 1 }}>
          {sparar ? 'Sparar …' : 'Uppfattat'}
        </button>
      </div>
      {/* Uppfattat räcker för att kortet försvinner; ringen runt maskinen ligger kvar. Den här raden stänger av även ringen – tryck när du ser hen. */}
      <button type="button" data-testid="besok-kort-stang-av" onClick={onStangAv} disabled={sparar}
        style={{ display: 'block', width: '100%', minHeight: TRAFFYTA.min, marginTop: AVSTAND.s, border: 'none', background: 'transparent', color: FARG.bg, ...TYP.text, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', opacity: sparar ? 0.6 : 1 }}>
        Stäng av när du ser hen
      </button>
      {fel && <div role="status" style={{ ...TYP.meta, marginTop: AVSTAND.s }}>{fel}</div>}
      {fler > 0 && <div data-testid="besok-kort-fler" style={{ ...TYP.meta, marginTop: AVSTAND.s }}>+{fler} besök till</div>}
    </div>
  );
}
