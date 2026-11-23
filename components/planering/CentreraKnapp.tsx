'use client';

// CENTRERA-KNAPPEN — EN komponent för körvyn och planeringsvyn (regeln bor i lib/centrera). Samma utseende och placering
// i båda: rund, mörk/genomskinlig, nere till höger rakt ovanför +-knappen. Dold (utfadad, inget tryck) när den inte behövs.

import React, { useRef } from 'react';
import { skapaLangtryck } from '@/lib/langtryck';
import { ZOOM_HALL_MS } from '@/lib/korvyZoom';
import { AVSTAND, FARG, RADIE, TYP } from '@/lib/design/tokens';

export function CentreraKnapp({ synlig, onTryck, onHall, bottom = 'calc(env(safe-area-inset-bottom, 0px) + 76px)' }: {
  synlig: boolean;
  onTryck: () => void;
  /** Körvyn: håll in knappen (ZOOM_HALL_MS) → valet att spara zoomen. Utan den är knappen ett vanligt tryck (planeringsvyn). */
  onHall?: () => void;
  /** Avstånd från skärmens nederkant. Standard = rakt ovanför planeringens +-knapp; rundvyn lägger den ovanför dockan. */
  bottom?: string;
}) {
  // Håll in: efter ett håll kommer fingerlyftet som ett vanligt klick — det ska inte också centrera (lib/langtryck.slukKlick).
  const lt = useRef(skapaLangtryck(ZOOM_HALL_MS)).current;
  const hall = onHall && synlig
    ? {
        onPointerDown: (e: React.PointerEvent) => lt.start(() => onHall(), e.clientX, e.clientY),
        onPointerMove: (e: React.PointerEvent) => lt.rorelse(e.clientX, e.clientY),
        onPointerUp: lt.stopp,
        onPointerLeave: lt.stopp,
        onPointerCancel: lt.stopp,
        onContextMenu: (e: React.SyntheticEvent) => e.preventDefault(),
      }
    : {};
  return (
    <button
      type="button"
      data-testid="centrera-knapp"
      aria-label="Centrera på min position"
      aria-hidden={!synlig}
      tabIndex={synlig ? 0 : -1}
      {...hall}
      onClick={() => { if (!synlig) return; if (onHall && lt.slukKlick()) return; onTryck(); }}
      className="press-scale"
      style={{
        position: 'fixed',
        bottom,   // standard: rakt ovanför +-knappen
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
        ...(onHall ? { touchAction: 'manipulation', WebkitTouchCallout: 'none', userSelect: 'none' } : null),
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

// Valet som kommer när Centrera hålls in: EN knapp, "Spara den här zoomen". Ett tryck utanför stänger utan att spara något (samma mönster som
// håll-kortet i plusraden: genomskinlig bakgrund som fångar trycket, kortet ovanpå). Ligger rakt ovanför Centrera-knappen, mörkt kort som övriga val.
const VAL_OVER_PX = 76 + 44 + AVSTAND.s;   // Centrera-knappens underkant (76) + dess höjd (44) + luft

export function CentreraZoomVal({ onSpara, onStang }: { onSpara: () => void; onStang: () => void }) {
  // Valet öppnas medan fingret ligger kvar på Centrera. När fingret lyfts skapar webbläsaren ett klick på det som nu ligger överst — bakgrunden — och det
  // får inte stänga valet (uppmätt i Chromium med riktig touch). Bakgrunden stänger därför bara på ett tryck som BÖRJADE på den (pekare ned → klick).
  const tryckBorjade = useRef(false);
  return (
    <>
      <div
        onPointerDown={() => { tryckBorjade.current = true; }}
        onClick={() => { if (!tryckBorjade.current) return; tryckBorjade.current = false; onStang(); }}
        data-testid="centrera-zoomval-bakgrund"
        style={{ position: 'fixed', inset: 0, zIndex: 655 }}
      />
      <div
        role="dialog"
        aria-label="Spara den här zoomen"
        data-testid="centrera-zoomval"
        style={{
          position: 'fixed', right: AVSTAND.l, zIndex: 660, boxSizing: 'border-box', padding: AVSTAND.s, borderRadius: RADIE.sheet,
          bottom: `calc(${VAL_OVER_PX}px + env(safe-area-inset-bottom, 0px))`, background: FARG.upphojt, border: `1px solid ${FARG.linje}`,
        }}
      >
        <button
          type="button"
          data-testid="centrera-zoomval-spara"
          onClick={onSpara}
          className="press-dim"
          style={{
            minHeight: 48, padding: `0 ${AVSTAND.l}px`, border: 'none', borderRadius: RADIE.knapp, background: FARG.text, color: FARG.bg,
            fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', ...TYP.listtitel,
          }}
        >
          Spara den här zoomen
        </button>
      </div>
    </>
  );
}
