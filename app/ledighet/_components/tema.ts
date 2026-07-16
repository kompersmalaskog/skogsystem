// Delad visuell grund för ledighetsvyn — samma mörka palett som resten av appen.
import type React from 'react';

export const ff =
  "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',system-ui,sans-serif";

export const C = {
  bg: '#111110',
  surface: '#1C1C1E',
  surface2: '#1C1C1E',
  surface3: '#2C2C2E',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.15)',
  t1: '#ffffff',
  t2: 'rgba(255,255,255,0.7)',
  t3: 'rgba(255,255,255,0.4)',
  t4: 'rgba(255,255,255,0.2)',
  green: '#22c55e',
  greenDim: 'rgba(34,197,94,0.15)',
  red: '#ef4444',
  redDim: 'rgba(239,68,68,0.15)',
  yellow: '#eab308',
  yellowDim: 'rgba(234,179,8,0.15)',
  blue: '#3b82f6',
  blueDim: 'rgba(59,130,246,0.15)',
  orange: '#f97316',
  orangeDim: 'rgba(249,115,22,0.15)',
  nekad: '#BE185D',
  nekadDim: 'rgba(190,24,93,0.15)',
} as const;

// Bara personledighet — stopp är en egen modell (tabellen stopp), inte en ledighetstyp.
export type LedighetTyp = 'semester' | 'atk';
export type LedighetStatus = 'väntar' | 'godkänd' | 'nekad';

export const TYPINFO: Record<LedighetTyp, { label: string; color: string; bg: string }> = {
  semester: { label: 'Semester', color: C.green, bg: C.greenDim },
  atk: { label: 'ATK', color: C.blue, bg: C.blueDim },
};

export const STATUSINFO: Record<LedighetStatus, { label: string; color: string; bg: string }> = {
  'väntar': { label: 'Väntar', color: C.yellow, bg: C.yellowDim },
  'godkänd': { label: 'Godkänd', color: C.green, bg: C.greenDim },
  'nekad': { label: 'Nekad', color: C.nekad, bg: C.nekadDim },
};

export const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: C.t3, marginBottom: 4,
};

export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  background: 'rgba(118,118,128,0.18)', border: `1px solid ${C.border}`,
  color: C.t1, fontSize: 14, fontFamily: ff,
  outline: 'none', boxSizing: 'border-box',
  colorScheme: 'dark',
};

export const kortStyle: React.CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 14, padding: '16px 18px',
};
