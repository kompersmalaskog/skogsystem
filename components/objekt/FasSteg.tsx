// STEGEN FÖR EN TRAKT — "✓ Planerat ✓ Skördat Skotas". EN komponent för Planeringens objektlista och Översiktens Trakter-lista,
// så att samma trakt ser likadan ut överallt (Martin 2026-11-06: "här är det ju inte samma"). Stegen räknas av `fasSteg` (lib/objektVal);
// här ritas de bara: klart = grön bock, väntar = orange, pågår = vit, inte börjat = grå. Färgen står aldrig ensam (ordet + bocken).
import React from 'react';
import { AVSTAND, FARG, TYP, VIKT } from '@/lib/design/tokens';
import type { Steg } from '@/lib/objektVal';

export function FasSteg({ steg, testId, kvarSkot = false }: { steg: Steg[]; testId?: string; kvarSkot?: boolean }) {
  if (!steg.length) return null;
  return (
    <span data-testid={testId} aria-hidden="true"
      style={{ display: 'flex', flexWrap: 'wrap', columnGap: AVSTAND.m, ...TYP.meta, fontWeight: VIKT.halvfet }}>
      {steg.map((x) => (
        <span key={x.id} data-testid={testId ? `${testId}-${x.id}` : undefined} data-lage={x.lage} data-kvar={kvarSkot && x.id === 'skot' ? '1' : undefined}
          style={{ whiteSpace: 'nowrap', color: x.lage === 'klar' ? FARG.gron : x.lage === 'vantar' ? FARG.orange : x.lage === 'pagar' ? FARG.text : FARG.text2 }}>
          {x.lage === 'klar' ? `✓ ${x.text}` : x.text}
        </span>
      ))}
    </span>
  );
}

/** Steg i ord, för skärmläsare ("Planerat klart, Skördas, Skotning"). */
export const fasStegText = (steg: Steg[]) => steg.map((x) => (x.lage === 'klar' ? `${x.text} klart` : x.text)).join(', ');
