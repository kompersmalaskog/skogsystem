'use client';

import React from 'react';
import Link from 'next/link';
import { T, KRAVTYP_META, visaNamn, type Kravtyp, type Medarbetare } from '@/lib/utbildning';

// ---- Sidhuvud (stor iOS-titel med valfri bakåtlänk + åtgärd) ----
export function UtbHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: { href: string; label?: string };
  action?: React.ReactNode;
}) {
  return (
    <div style={{ padding: 'calc(env(safe-area-inset-top) + 8px) 16px 4px', fontFamily: T.ff }}>
      {/* Rad 1: bakåtlänk (blå 17px) + åtgärd i högra hörnet */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 30 }}>
        {back ? (
          <Link
            href={back.href}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: T.blue, textDecoration: 'none', fontSize: 17, marginLeft: -8 }}
          >
            <svg width="11" height="18" viewBox="0 0 11 18" fill="none" aria-hidden="true" style={{ display: 'block' }}>
              <path d="M9 1.5L2 9L9 16.5" stroke={T.blue} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {back.label ?? 'Tillbaka'}
          </Link>
        ) : (
          <span />
        )}
        {action ?? <span />}
      </div>

      {/* Rad 2: stor titel */}
      <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: 0.3, margin: '2px 0 0', color: T.t1, lineHeight: 1.1 }}>
        {title}
      </h1>

      {/* Rad 3: undertitel */}
      {subtitle && <div style={{ fontSize: 15, fontWeight: 400, color: T.t2, marginTop: 3 }}>{subtitle}</div>}
    </div>
  );
}

// ---- Tillstånd: laddar / fel / tomt (skiljs alltid åt) ----
export function LoadingView({ text = 'Laddar…' }: { text?: string }) {
  return <p style={{ color: T.t2, textAlign: 'center', marginTop: 48, fontFamily: T.ff }}>{text}</p>;
}

export function ErrorView({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div
      style={{
        margin: '24px 16px',
        background: 'rgba(255,69,58,0.12)',
        border: '1px solid rgba(255,69,58,0.3)',
        borderRadius: 12,
        padding: '16px 18px',
        fontFamily: T.ff,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.red, fontWeight: 600, fontSize: 15, marginBottom: 6 }}>
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>error</span>
        Kunde inte hämta data
      </div>
      <div style={{ fontSize: 13, color: 'rgba(235,235,245,0.6)', wordBreak: 'break-word' }}>{error}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{ marginTop: 12, background: 'none', border: '1px solid rgba(255,69,58,0.4)', color: T.red, borderRadius: 8, padding: '8px 16px', fontSize: 14, fontFamily: T.ff, cursor: 'pointer' }}
        >
          Försök igen
        </button>
      )}
    </div>
  );
}

export function EmptyView({ text }: { text: string }) {
  return <p style={{ color: T.t2, textAlign: 'center', marginTop: 48, fontFamily: T.ff }}>{text}</p>;
}

// ---- Kravtyp-etikett ----
export function KravtypBadge({ kravtyp }: { kravtyp: Kravtyp }) {
  const palette: Record<Kravtyp, { bg: string; fg: string }> = {
    lag: { bg: 'rgba(255,69,58,0.15)', fg: '#FF6961' },
    certifiering: { bg: 'rgba(10,132,255,0.15)', fg: '#5AC8FA' },
    bestallare: { bg: 'rgba(255,159,10,0.15)', fg: '#FFB340' },
  };
  const p = palette[kravtyp];
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: p.fg,
        background: p.bg,
        padding: '3px 9px',
        borderRadius: 20,
        fontFamily: T.ff,
        whiteSpace: 'nowrap',
      }}
    >
      {KRAVTYP_META[kravtyp].label}
    </span>
  );
}

// ---- Formulär-primitiver ----
export const inputStyle: React.CSSProperties = {
  background: 'rgba(118,118,128,0.24)',
  borderRadius: 10,
  border: 'none',
  color: T.t1,
  padding: '11px 14px',
  fontSize: 16,
  fontFamily: T.ff,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  colorScheme: 'dark',
};

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 13, color: T.t2, display: 'block', marginBottom: 6, fontFamily: T.ff }}>
      {children}
    </label>
  );
}

export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <div style={{ display: 'flex', background: 'rgba(118,118,128,0.24)', borderRadius: 9, padding: 2, gap: 2 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              flex: 1,
              padding: '8px 4px',
              borderRadius: 7,
              border: 'none',
              background: active ? '#636366' : 'transparent',
              color: active ? '#fff' : T.t2,
              fontSize: 14,
              fontWeight: active ? 600 : 400,
              fontFamily: T.ff,
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 51,
        height: 31,
        borderRadius: 16,
        border: 'none',
        background: checked ? T.green : 'rgba(120,120,128,0.32)',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 22 : 2,
          width: 27,
          height: 27,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  );
}

// Fler personer kryssas i på en gång (registrera bevis / kravlista).
export function PersonChecklist({
  medarbetare,
  valda,
  onToggle,
}: {
  medarbetare: Medarbetare[];
  valda: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div style={{ background: T.group, borderRadius: 12, overflow: 'hidden' }}>
      {medarbetare.map((m, i) => {
        const on = valda.has(m.id);
        return (
          <React.Fragment key={m.id}>
            {i > 0 && <div style={{ height: 1, background: T.sep, marginLeft: 16 }} />}
            <div
              role="button"
              tabIndex={0}
              onClick={() => onToggle(m.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(m.id); } }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '11px 16px', cursor: 'pointer' }}
            >
              <span style={{ flex: 1, fontSize: 16, color: T.t1, fontFamily: T.ff }}>{visaNamn(m.namn)}</span>
              {on && (
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 22, color: T.blue }}>
                  check
                </span>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  color = T.blue,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '14px 0',
        borderRadius: 12,
        border: 'none',
        background: color,
        color: '#fff',
        fontSize: 17,
        fontWeight: 600,
        fontFamily: T.ff,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}
