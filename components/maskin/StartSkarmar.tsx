'use client';

// Skärmarna för /maskin och maskindatorns startsekvens.
//
//  • StartSvartSkarm — HELT svart, ingen logga och ingen text. Delas av /maskin-routens fallback, väntläget
//    ("roll/maskinregister laddas") och startsekvensens täckskikt, så att de tre ser identiska ut och inget
//    hoppar när ett byts mot nästa. Tonar ut (opacity) → kartan "tonar upp ur svart".
//  • MaskinSomFelSkarm — det ENDA stället loggan visas: felskärmar (ej behörig / okänd maskin / laddning
//    fastnar). Loggan är SAMMA fil som inloggningssidan (/logo.png), 1953×867.

import React from 'react';
import { COVER_FADE_MS } from '@/lib/maskinstart';

/** Helsvart täckskikt. synlig=false → tonar ut över COVER_FADE_MS och släpper igenom tryck. */
export function StartSvartSkarm({ synlig = true, zIndex = 9000 }: { synlig?: boolean; zIndex?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0, zIndex, background: '#000',
        opacity: synlig ? 1 : 0,
        pointerEvents: synlig ? 'auto' : 'none',
        transition: `opacity ${COVER_FADE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
      }}
    />
  );
}

/** Ärlig felskärm för /maskin?som=… — loggan + vad som är fel + en väg tillbaka. Aldrig en tom skärm. */
export function MaskinSomFelSkarm({ text, onTillbaka }: { text: string; onTillbaka: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9100, background: '#000', color: '#fff',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px',
      padding: '24px', textAlign: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
    }}>
      {/* SAMMA fil som inloggningssidan (/logo.png). Höjd styr storleken (bilden är 2,25:1); min(…, vh) ger
          plats åt texten och knappen i ett lågt fönster. width/height speglar det verkliga förhållandet. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Kompersmåla Skog" width={1953} height={867}
        style={{ height: 'min(190px, 28vh)', width: 'auto', maxWidth: '80vw', objectFit: 'contain', opacity: 0.95 }} />
      <div style={{ fontSize: '17px', lineHeight: 1.4, maxWidth: '420px' }}>{text}</div>
      <button type="button" onClick={onTillbaka}
        style={{ minHeight: '48px', padding: '0 28px', borderRadius: '12px', border: 'none', background: '#fff', color: '#000', fontSize: '17px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
        Till appen
      </button>
    </div>
  );
}
