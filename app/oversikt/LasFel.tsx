'use client';

import React from 'react';
import { C, T, BTN, SP } from './oversikt-types';
import { ff } from './oversikt-styles';

/* ── Läsfel i gamla /oversikt — texterna och raden på ETT ställe ──
   Ett läsfel får aldrig se ut som "inga faror" eller "tom kö" (se las-svar.ts). Samma ord som /oversikt-v2. */

export const LASFEL_FARA = 'Kunde inte läsa faror och hänsyn — kolla planeringen';
export const LASFEL_FARA_LADDAR = 'Läser faror och hänsyn…';
export const LASFEL_KO = 'Kunde inte läsa maskiner och köer — försök igen';
export const KO_KUNDE_INTE_LASAS = 'Kön kunde inte läsas';
export const LASFEL_POS = 'Kunde inte läsa var maskinerna står — maskiner kan saknas på kartan';
export const LASFEL_POS_DELVIS = 'Kunde inte läsa alla platser — en del maskiner kan stå på en äldre plats';

/** Orange felrad (role=alert) med valfri "Försök igen". Träffyta 44 px. Gamla vyns egna tokens — inga nya färger. */
export function LasFelRad({ text, onForsok, style }: { text: string; onForsok?: () => void; style?: React.CSSProperties }) {
  return (
    <div role="alert" style={{
      display: 'flex', alignItems: 'center', gap: SP.md,
      padding: `${SP.xs}px ${SP.md}px`, borderRadius: SP.sm,
      background: C.od, border: `1px solid ${C.orange}40`,
      ...T.caption, color: C.orange, fontWeight: 600, fontFamily: ff,
      ...style,
    }}>
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>{text}</span>
      {onForsok && (
        <button onClick={(e) => { e.stopPropagation(); onForsok(); }}
          style={{ ...BTN.secondary, padding: `0 ${SP.md}px`, color: C.orange, border: `1px solid ${C.orange}40`, flexShrink: 0, fontFamily: ff }}>
          Försök igen
        </button>
      )}
    </div>
  );
}
