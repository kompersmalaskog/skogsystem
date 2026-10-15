'use client';

// Basvägens färg: röd, gul eller blå. EN komponent för markeringsmenyn (ändra färg på en befintlig basväg) och för Rita linje / Spåra med GPS
// (välj färg innan man börjar) — samma knappar, samma ord. Färgen står som text bredvid fältet (färg är aldrig ensam bärare).

import React from 'react';
import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { BASVAG_FARGER, type BasvagFarg } from '@/lib/basvag';

export function BasvagFargVal({ valt, onVal, centrerad = false }: { valt: BasvagFarg | null | undefined; onVal: (f: BasvagFarg) => void; centrerad?: boolean }) {
  return (
    <div data-testid="basvag-farg-val" role="group" aria-label="Basvägens färg" style={{ display: 'flex', justifyContent: centrerad ? 'center' : 'flex-start', gap: AVSTAND.s, flexWrap: 'wrap' }}>
      {BASVAG_FARGER.map((f) => {
        const vald = valt === f.id;
        return (
          <button key={f.id} type="button" data-testid={`basvag-farg-${f.id}`} aria-pressed={vald} onClick={() => onVal(f.id)}
            style={{ minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s, borderRadius: RADIE.rad, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: FARG.fyllning, color: FARG.text, ...TYP.text, fontWeight: vald ? 700 : 400, boxShadow: vald ? `inset 0 0 0 ${AVSTAND.xs / 2}px ${FARG.text}` : 'none' }}>
            <span aria-hidden="true" style={{ width: AVSTAND.l, height: AVSTAND.s, borderRadius: AVSTAND.xs, background: f.hex }} />
            {f.namn}
          </button>
        );
      })}
    </div>
  );
}

/** Utfälld under raden "Basväg" i Rita linje och Spåra med GPS: färgval (senast valda förvald) och EN handling. */
export function BasvagStart({ valt, onVal, onStarta, text, testid }: { valt: BasvagFarg; onVal: (f: BasvagFarg) => void; onStarta: () => void; text: string; testid: string }) {
  return (
    <div data-testid={testid} style={{ padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.l}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      <BasvagFargVal valt={valt} onVal={onVal} />
      <button type="button" data-testid={`${testid}-starta`} onClick={onStarta} style={{ ...KNAPP.primar, cursor: 'pointer', fontFamily: 'inherit' }}>{text}</button>
    </div>
  );
}
