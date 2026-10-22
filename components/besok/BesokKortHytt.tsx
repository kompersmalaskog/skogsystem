'use client';

// Besökskortet i hytten: ORANGE, högst upp — "Besök: Anna Svensson kommer ca 14:30", telefonnumret och en stor "Uppfattat" (≥ 56 px).
// Ligger kvar tills Uppfattat. Flera besök: det tidigaste visas, resten som "+N till". Ett ljud (hooken). Larm (fara) går före — det avgör sidan.

import React from 'react';
import { AVSTAND, FARG, RADIE, TYP } from '@/lib/design/tokens';
import { besokRubrik } from '@/lib/besok/status';
import { kommerText } from '@/lib/besok/tid';
import type { HyttBesok } from '@/lib/besok/hytt';

export const BESOK_KORT_MIN_KNAPP_PX = 56;

export default function BesokKortHytt({ besok, fler, sparar, fel, onUppfattat, top }: {
  besok: HyttBesok; fler: number; sparar: boolean; fel: string | null; onUppfattat: () => void; top: string;
}) {
  return (
    <div data-testid="besok-kort" role="alert" style={{ position: 'fixed', left: AVSTAND.m, right: AVSTAND.m, top, zIndex: 130, maxWidth: 520, margin: '0 auto', background: FARG.orange, color: FARG.bg, borderRadius: RADIE.kort, padding: AVSTAND.l }}>
      <div data-testid="besok-kort-rubrik" style={{ ...TYP.rubrik, overflowWrap: 'anywhere' }}>{besokRubrik(besok.namn, kommerText(besok.besokstid))}</div>
      <a data-testid="besok-kort-tel" href={`tel:${besok.telefon.replace(/[^\d+]/g, '')}`} style={{ display: 'inline-block', marginTop: AVSTAND.xs, ...TYP.listtitel, color: FARG.bg, textDecoration: 'underline' }}>{besok.telefon}</a>
      <button type="button" data-testid="besok-kort-uppfattat" onClick={onUppfattat} disabled={sparar}
        style={{ display: 'block', width: '100%', minHeight: BESOK_KORT_MIN_KNAPP_PX, marginTop: AVSTAND.m, border: 'none', borderRadius: RADIE.knapp, background: FARG.bg, color: FARG.text, ...TYP.listtitel, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', opacity: sparar ? 0.6 : 1 }}>
        {sparar ? 'Sparar …' : 'Uppfattat'}
      </button>
      {fel && <div role="status" style={{ ...TYP.meta, marginTop: AVSTAND.s }}>{fel}</div>}
      {fler > 0 && <div data-testid="besok-kort-fler" style={{ ...TYP.meta, marginTop: AVSTAND.s }}>+{fler} besök till</div>}
    </div>
  );
}
