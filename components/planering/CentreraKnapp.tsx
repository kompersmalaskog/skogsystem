'use client';

// CENTRERA-KNAPPEN — EN komponent för körvyn och planeringsvyn (regeln bor i lib/centrera). Samma utseende och placering
// i båda: rund, mörk/genomskinlig, nere till höger rakt ovanför +-knappen. Dold (utfadad, inget tryck) när den inte behövs.

import React from 'react';

export function CentreraKnapp({ synlig, onTryck }: { synlig: boolean; onTryck: () => void }) {
  return (
    <button
      type="button"
      data-testid="centrera-knapp"
      aria-label="Centrera på min position"
      aria-hidden={!synlig}
      tabIndex={synlig ? 0 : -1}
      onClick={() => { if (synlig) onTryck(); }}
      className="press-scale"
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)',   // rakt ovanför +-knappen
        right: '16px',
        width: '44px',
        height: '44px',
        borderRadius: '50%',
        background: 'rgba(20,20,22,0.72)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#fff',
        cursor: synlig ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 260,
        opacity: synlig ? 1 : 0,
        pointerEvents: synlig ? 'auto' : 'none',
        transition: 'opacity 180ms ease',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </svg>
    </button>
  );
}
