'use client';

import React from 'react';
import { AVSTAND, FARG, RADIE, TYP } from '@/lib/design/tokens';
import { KNAPP_LITEN } from './ark-delar';

// Läsfel som INTE stoppar kartan (objekt och maskiner lästes): kön och virke på backen. Ett läsfel är aldrig "tomt" — raderna överst på kartan
// säger det, var och en med sin egen "Försök igen", och maskin-/objekt-arken säger det där en tom kö eller en tom förslagslista annars stått.

export const LASFEL_KO = 'Kunde inte läsa köerna — försök igen';
export const LASFEL_SKORD = 'Kunde inte läsa virke på backen — förslag och objekt att lägga till kan saknas';
/** I arket där "Nästa: inget planerat" annars stått */
export const KO_OKAND_TEXT = 'Kön kunde inte läsas';
export const SKORD_OKAND_TEXT = 'Förslag saknas — virke på backen kunde inte läsas';

export interface LasFelPost { id: string; text: string; onForsok: () => void }

/** `topp` i px: under GROT-chippen när den finns. Banern ligger över arken (z 9) så den syns även med ett ark öppet. */
export function LasFelBanner({ poster, topp }: { poster: LasFelPost[]; topp: number }) {
  if (poster.length === 0) return null;
  return (
    <div style={{ position: 'absolute', top: topp, left: AVSTAND.m, right: AVSTAND.m, zIndex: 9, display: 'flex', flexDirection: 'column', gap: AVSTAND.s, pointerEvents: 'none' }}>
      {poster.map((p) => (
        <div key={p.id} role="alert" style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `${AVSTAND.xs}px ${AVSTAND.m}px`, borderRadius: RADIE.kort, background: FARG.kort, border: `1px solid ${FARG.orange}`, color: FARG.orange, ...TYP.meta, fontWeight: 600 }}>
          <span style={{ flex: 1, minWidth: 0 }}>{p.text}</span>
          <button onClick={p.onForsok} style={{ ...KNAPP_LITEN, flexGrow: 0, flexShrink: 0, padding: `0 ${AVSTAND.m}px`, color: FARG.text }}>Försök igen</button>
        </div>
      ))}
    </div>
  );
}
