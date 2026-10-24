'use client';

// Besökskortet i hytten: ORANGE, högst upp — "Besök: Anna Svensson kommer ca 14:30", knapparna "Ring Anna" och "Uppfattat" (båda ≥ 56 px) och textraden "Stäng av när du ser hen".
// Ligger kvar tills Uppfattat. Flera besök: det tidigaste visas, resten som "+N till". Ett ljud (hooken). Larm (fara) går före — det avgör sidan.

import React from 'react';
import { AVSTAND, FARG, RADIE, TYP } from '@/lib/design/tokens';
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

export default function BesokKortHytt({ besok, fler, sparar, fel, onUppfattat, top }: {
  besok: HyttBesok; fler: number; sparar: boolean; fel: string | null; onUppfattat: () => void; top: string;
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
      {/* En TEXTRAD, ingen knapp (Martin 2026-10-24): säger vad föraren ska göra när hen ser besökaren. Kortet har bara två knappar: Ring och Uppfattat. */}
      <div data-testid="besok-kort-stang-av" style={{ ...TYP.text, marginTop: AVSTAND.s }}>Stäng av när du ser hen</div>
      {fel && <div role="status" style={{ ...TYP.meta, marginTop: AVSTAND.s }}>{fel}</div>}
      {fler > 0 && <div data-testid="besok-kort-fler" style={{ ...TYP.meta, marginTop: AVSTAND.s }}>+{fler} besök till</div>}
    </div>
  );
}
