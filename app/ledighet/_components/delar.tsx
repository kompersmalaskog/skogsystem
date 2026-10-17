'use client';

import React from 'react';
import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';

/** Korta textknappar (Nej, Rensa, Idag) är minst `TRAFFYTA.min` breda — höjden 44 ger KNAPP.*, bredden ger den här. */
export const KORT_TEXTKNAPP = { minWidth: TRAFFYTA.min } as const;

/**
 * EN felstil för hela vyn (förr tre: röd pill-toast, röd ruta med ram, rosa/orange rutor i arket):
 * `TYP.meta` i `FARG.rod`, direkt vid det som gick fel, kvar tills man gjort något nytt.
 * Samma som Arbetsrapports `felRad`/`bekraftaFel`.
 */
export function FelText({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return <p role="alert" style={{ margin: 0, ...TYP.meta, color: FARG.rod }}>{text}</p>;
}

/** Tomt/laddar/fel mitt i vyn: `TYP.meta` i `FARG.text2`, ingen ram. */
export function StatusText({ text, farg = FARG.text2 }: { text: string; farg?: string }) {
  return <p style={{ margin: 0, padding: `${AVSTAND.xl}px 0`, textAlign: 'center', ...TYP.meta, color: farg }}>{text}</p>;
}

/** Läsfel med utväg: texten säger vad man gör, och knappen gör det (Arbetsrapports "Försök igen"). */
export function LasFel({ text, onForsok }: { text: string; onForsok: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.m, padding: `${AVSTAND.xl}px 0` }}>
      <p role="alert" style={{ margin: 0, textAlign: 'center', ...TYP.text, color: FARG.text }}>{text}</p>
      <button onClick={onForsok} style={{ ...KNAPP.sekundar, width: 'auto', minWidth: TRAFFYTA.primar * 3 }}>Försök igen</button>
    </div>
  );
}

/** Status som prick + ord (färg bär aldrig ensam): en nyans per status. */
export function Status({ ord, farg }: { ord: string; farg: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s, flexShrink: 0, ...TYP.meta, color: FARG.text }}>
      <span aria-hidden style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: farg }} />
      {ord}
    </span>
  );
}
