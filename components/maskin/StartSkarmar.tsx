'use client';

// Skärmarna som delas av /maskin-routens fallback, väntläget ("roll/maskinregister laddas") och
// startsekvensens logga-lager i planeringsvyn. EN komponent → de tre ser identiska ut, så att inget
// hoppar när ett byts mot nästa. Loggan är SAMMA fil som inloggningssidan (/logo.png), 1953×867.

import React from 'react';

/** Mörk skärm med loggan (~190 px hög, syns från förarstolen) och maskinens namn litet under.
 *  synlig=false → tonar ut (opacity) och släpper igenom tryck, så kartan glider fram under. */
export function StartLoggaSkarm({ maskinNamn, synlig = true, zIndex = 9000 }: {
  maskinNamn?: string | null;
  synlig?: boolean;
  zIndex?: number;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex, background: '#000',
      opacity: synlig ? 1 : 0,
      pointerEvents: synlig ? 'auto' : 'none',
      transition: 'opacity 650ms cubic-bezier(0.32, 0.72, 0, 1)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px',
    }}>
      {/* SAMMA fil som inloggningssidan (/logo.png) — ingen egen logga. Bilden är 1953×867 (2,25:1), så
          storleken anges som HÖJD: ca 190 px syns från förarstolen. min(190px, 40vh) håller den inom
          skärmen om fönstret är lågt. width/height speglar det verkliga förhållandet. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Kompersmåla Skog" width={1953} height={867}
        style={{ height: 'min(190px, 40vh)', width: 'auto', maxWidth: '80vw', objectFit: 'contain', opacity: 0.95 }} />
      {maskinNamn ? <div style={{ fontSize: '15px', color: '#8e8e93', fontWeight: 600 }}>{maskinNamn}</div> : null}
    </div>
  );
}

/** Ärlig felskärm för /maskin?som=… (ej behörig / okänd maskin / laddning fastnade). Aldrig en tom logga. */
export function MaskinSomFelSkarm({ text, onTillbaka }: { text: string; onTillbaka: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9100, background: '#000', color: '#fff',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px',
      padding: '24px', textAlign: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
    }}>
      <div style={{ fontSize: '17px', lineHeight: 1.4, maxWidth: '420px' }}>{text}</div>
      <button type="button" onClick={onTillbaka}
        style={{ minHeight: '48px', padding: '0 28px', borderRadius: '12px', border: 'none', background: '#fff', color: '#000', fontSize: '17px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
        Till appen
      </button>
    </div>
  );
}
