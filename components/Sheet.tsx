'use client';

import React from 'react';
import { T } from '@/lib/utbildning';

// iOS-bottensheet med bakgrundsdimma. Renderar inget när open=false.
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
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
        }}
      >
        <div style={{ width: 36, height: 5, borderRadius: 3, background: 'rgba(235,235,245,0.3)', margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: T.t1 }}>{title}</h2>
          <button
            onClick={onClose}
            aria-label="Stäng"
            style={{ background: 'none', border: 'none', color: T.blue, fontSize: 17, cursor: 'pointer', fontFamily: T.ff, padding: 4 }}
          >
            Klar
          </button>
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
