'use client';

// Alla larmplatser på en trakt som rader (lib/larmpunkter). Används av förarens kort, ⓘ-kortet och "Om något händer".
// Vida lägger en larmplats vid varje avlägg; på en utspridd trakt är det flera. Varje rad är avlägget och koordinaten —
// tryck visar platsen på kartan. Den närmaste (när positionen är färsk) är märkt "Närmast dig".

import React from 'react';
import { AVSTAND, FARG, TNUM, TYP } from '@/lib/design/tokens';
import { LARM_VALJ_SJALV, type LarmVisning } from '@/lib/larmpunkter';
import { RadKnapp } from './infoDelar';

/** Orange rad ovanför listan när GPS saknas och föraren måste välja själv. */
export function LarmValjSjalv() {
  return <div data-testid="larm-valj-sjalv" style={{ padding: `${AVSTAND.s}px ${AVSTAND.l}px`, ...TYP.meta, color: FARG.orange }}>{LARM_VALJ_SJALV}</div>;
}

export default function LarmPlatser({ larm, onVisa, forstaRad = false }: { larm: LarmVisning; onVisa: (index: number) => void; forstaRad?: boolean }) {
  if (larm.platser.length === 0) return null;
  return (
    <div data-testid="larm-platser">
      {larm.platser.map((p, i) => (
        <RadKnapp key={`${p.koordinat}-${i}`} forstaRad={forstaRad && i === 0} testid={`larm-plats-${i}`}
          etikett={p.narmast ? <span>{p.namn} <span style={{ ...TYP.meta, color: FARG.gron }}>· närmast dig</span></span> : p.namn}
          under={<span style={TNUM}>{p.koordinat}</span>}
          onTryck={() => onVisa(i)} />
      ))}
    </div>
  );
}
