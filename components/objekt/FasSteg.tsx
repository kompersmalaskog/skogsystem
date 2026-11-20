// LÄGET FÖR EN TRAKT — prick + ETT ord: "Skördas nu", "Väntar på skotare", "Skotas nu". EN komponent för Planeringens objektlista och
// Översiktens Trakter-lista och Min plan, så att samma trakt ser likadan ut överallt (Martin 2026-11-06: "här är det ju inte samma").
// Förut ritades hela kedjan ("✓ Planerat ✓ Skördat Väntar på skotare"); nu bara var trakten är (Martin 2026-11-17). Läget räknas av
// `stegLage` (lib/objektVal) ur samma steg som förut. Orange = väntar på någon, grön = en maskin jobbar där eller klart, grå = inte börjat.
// Färgen står aldrig ensam: ordet säger samma sak.
import React from 'react';
import { AVSTAND, FARG, RADIE, TYP } from '@/lib/design/tokens';
import { stegLage, type Steg } from '@/lib/objektVal';

const TON = { gron: FARG.gron, orange: FARG.orange, gra: FARG.text3 } as const;

export function FasSteg({ steg, testId, kvarSkot = false }: { steg: Steg[]; testId?: string; kvarSkot?: boolean }) {
  const lage = stegLage(steg);
  if (!lage) return null;
  return (
    <span data-testid={testId} data-ton={lage.ton} data-steg={lage.id} data-kvar={kvarSkot ? '1' : undefined} aria-hidden="true"
      style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.meta, color: FARG.text }}>
      <span style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, flexShrink: 0, background: TON[lage.ton] }} />
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{lage.text}</span>
    </span>
  );
}

/** Läget i ord, för skärmläsare ("Väntar på skotare"). */
export const fasStegText = (steg: Steg[]) => stegLage(steg)?.text ?? '';
