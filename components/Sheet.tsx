'use client';

import React, { useRef, useState } from 'react';
import { T } from '@/lib/utbildning';
import { AVSTAND, RADIE, RORELSE } from '@/lib/design/tokens';

// Avståndet under rubrikraden är 18 px i ALLA sheets (ingen token är 18, så det byggs av två: 16 + 4/2); ändras det ändras varje sheet i appen.
const RUBRIK_AVSTAND = AVSTAND.l + AVSTAND.xs / 2;

// Hur långt ner man drar för att stänga, och hur långt man måste röra fingret innan det räknas som drag (så ett tryck på "Klar" förblir ett tryck).
const DRAG_STANG = AVSTAND.xxl * 3;
const DRAG_START = AVSTAND.s;

// iOS-bottensheet med bakgrundsdimma. Renderar inget när open=false. Stängs med "Klar" och med tryck utanför;
// med `dragNedStanger` även med drag nedåt i grepp-området (strecket och rubrikraden). Av som standard: de andra sheetsen i appen är oförändrade.
export function Sheet({
  open,
  onClose,
  title,
  children,
  dragNedStanger = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  dragNedStanger?: boolean;
}) {
  const [dy, setDy] = useState(0);
  const [drar, setDrar] = useState(false);
  const start = useRef<{ y: number; fast: boolean } | null>(null);
  if (!open) return null;

  const grepp = dragNedStanger
    ? {
        'data-sheet-grepp': '',
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => { start.current = { y: e.clientY, fast: false }; },
        onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
          const st = start.current;
          if (!st) return;
          const d = e.clientY - st.y;
          if (!st.fast && d > DRAG_START) {
            st.fast = true;
            setDrar(true);
            // Greppet tas först när det är ett drag, annars skulle ett tryck på "Klar" hamna på fel element.
            try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* inte alla miljöer har pekarfångst */ }
          }
          if (st.fast) setDy(Math.max(0, d));
        },
        onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
          const st = start.current;
          start.current = null;
          setDrar(false);
          if (st?.fast && e.clientY - st.y > DRAG_STANG) { setDy(0); onClose(); } else setDy(0);
        },
        onPointerCancel: () => { start.current = null; setDrar(false); setDy(0); },
        style: { touchAction: 'none' as const },
      }
    : {};

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 6000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 520,
          background: '#1C1C1E',
          borderRadius: '16px 16px 0 0',
          padding: '10px 20px calc(28px + env(safe-area-inset-bottom))',
          maxHeight: '92vh',
          overflowY: 'auto',
          fontFamily: T.ff,
          transform: dy > 0 ? `translateY(${dy}px)` : undefined,
          transition: drar ? 'none' : `transform ${RORELSE.byte}ms ${RORELSE.kurva}`,
        }}
      >
        <div {...grepp}>
          <div style={{ width: 36, height: 5, borderRadius: RADIE.cirkel, background: 'rgba(235,235,245,0.3)', margin: '0 auto 14px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: RUBRIK_AVSTAND }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: T.t1 }}>{title}</h2>
            <button
              onClick={onClose}
              aria-label="Stäng"
              style={{ background: 'none', border: 'none', color: T.blue, fontSize: 17, cursor: 'pointer', fontFamily: T.ff, padding: 4 }}
            >
              Klar
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// Bekräftelsedialog (centrerad), t.ex. inför radering.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Ta bort',
  cancelLabel = 'Avbryt',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 6500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: T.ff }}>
      <div onClick={busy ? undefined : onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 300,
          background: '#2C2C2E',
          borderRadius: 14,
          overflow: 'hidden',
          textAlign: 'center',
        }}
      >
        <div style={{ padding: '20px 18px 16px' }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: T.t1, marginBottom: message ? 6 : 0 }}>{title}</div>
          {message && <div style={{ fontSize: 13, color: 'rgba(235,235,245,0.6)' }}>{message}</div>}
        </div>
        <div style={{ height: 1, background: 'rgba(84,84,88,0.5)' }} />
        <div style={{ display: 'flex' }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{ flex: 1, padding: '13px 0', background: 'none', border: 'none', borderRight: '1px solid rgba(84,84,88,0.5)', color: T.blue, fontSize: 17, fontFamily: T.ff, cursor: 'pointer' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{ flex: 1, padding: '13px 0', background: 'none', border: 'none', color: danger ? T.red : T.blue, fontSize: 17, fontWeight: 600, fontFamily: T.ff, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
