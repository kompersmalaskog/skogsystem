'use client';

// Basvägens utseende: Blå/gul (dagens — blå med gula streck), röd, gul eller blå. EN komponent för markeringsmenyn (ändra en befintlig basväg) och
// för Rita linje / Spåra med GPS (välj innan man börjar) — samma knappar, samma ord, Blå/gul först. Valet står som text bredvid rutan (färg är
// aldrig ensam bärare). Fyra knappar i 2 × 2: de ryms på en telefon utan att radbrytas mitt i.

import React from 'react';
import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { BASVAG_VAL, basvagValYta, type BasvagVal } from '@/lib/basvag';

export function BasvagFargVal({ valt, onVal }: { valt: BasvagVal; onVal: (v: BasvagVal) => void }) {
  return (
    <div data-testid="basvag-farg-val" role="group" aria-label="Basvägens utseende" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: AVSTAND.s }}>
      {BASVAG_VAL.map((v) => {
        const vald = valt === v.id;
        return (
          <button key={v.id} type="button" data-testid={`basvag-farg-${v.id}`} aria-pressed={vald} onClick={() => onVal(v.id)}
            style={{ minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.s, borderRadius: RADIE.rad, border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              background: FARG.fyllning, color: FARG.text, ...TYP.text, fontWeight: vald ? 700 : 400, boxShadow: vald ? `inset 0 0 0 ${AVSTAND.xs / 2}px ${FARG.text}` : 'none' }}>
            <span aria-hidden="true" style={{ width: AVSTAND.xl, height: AVSTAND.s, borderRadius: AVSTAND.xs, background: basvagValYta(v.id), flexShrink: 0 }} />
            {v.namn}
          </button>
        );
      })}
    </div>
  );
}

/** Utfälld under raden "Basväg" i Rita linje och Spåra med GPS: valet (senast valda förvald, Blå/gul första gången) och EN handling. */
export function BasvagStart({ valt, onVal, onStarta, text, testid }: { valt: BasvagVal; onVal: (v: BasvagVal) => void; onStarta: () => void; text: string; testid: string }) {
  return (
    <div data-testid={testid} style={{ padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.l}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      <BasvagFargVal valt={valt} onVal={onVal} />
      <button type="button" data-testid={`${testid}-starta`} onClick={onStarta} style={{ ...KNAPP.primar, cursor: 'pointer', fontFamily: 'inherit' }}>{text}</button>
    </div>
  );
}
