'use client';

// KVITTO NERTILL i körvyn: "Högstubbe satt — Ångra" i 5 s efter en snabbmarkering, eller ett felkvitto (orange) när markeringen
// inte kunde sättas (ingen/gammal position). Ångra-knappen är 56 px hög. Ligger över proximitetskortet (z 260) men under
// snabbarket (z 640/650) och bekräftelsemodalerna.

import React from 'react';

export function KorvyKvitto({ text, ton, onAngra }: { text: string; ton: 'ok' | 'fel'; onAngra?: () => void }) {
  const fel = ton === 'fel';
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="korvy-kvitto"
      data-ton={ton}
      style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)', zIndex: 600,
        display: 'flex', alignItems: 'center', gap: 6, minHeight: 56, maxWidth: 'min(520px, calc(100vw - 150px))', padding: onAngra ? '0 6px 0 22px' : '0 22px',
        borderRadius: 28, background: fel ? 'rgba(255,159,10,0.96)' : '#1c1f22', color: fel ? '#1a1200' : '#f2f2f2',
        border: fel ? 'none' : '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
        fontSize: 17, fontWeight: 600, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
      }}
    >
      <span style={{ flex: '1 1 auto', minWidth: 0 }}>{text}</span>
      {onAngra && (
        <button
          type="button"
          data-testid="korvy-kvitto-angra"
          onClick={onAngra}
          className="press-dim"
          style={{
            height: 48, minWidth: 96, padding: '0 20px', borderRadius: 24, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.1)',
            color: '#fff', fontSize: 17, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0,
          }}
        >
          Ångra
        </button>
      )}
    </div>
  );
}
