// Delade ark-delar för /oversikt-v2: maskin-arket, objekt-arket och GROT-arken ska se EXAKT likadana ut.
// Flyttade ordagrant ur page.tsx (en Next-sida kan inte exportera annat än sin default) — inga värden ändrade.
import React from 'react';
import { FARG, TYP, AVSTAND, RADIE } from '@/lib/design/tokens';

export const KNAPP: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.s, flexGrow: 1, minHeight: 50, border: `0.5px solid #48484a`, borderRadius: RADIE.knapp, textDecoration: 'none', ...TYP.listtitel, color: FARG.text, fontFamily: 'inherit', background: 'transparent', cursor: 'pointer' };
export const KNAPP_LITEN: React.CSSProperties = { ...KNAPP, minHeight: 44, ...TYP.text };

export const SheetBas: React.CSSProperties = { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 8, display: 'flex', flexDirection: 'column', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px calc(${AVSTAND.xl}px + env(safe-area-inset-bottom))`, background: FARG.kort, borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`, boxShadow: '0 -8px 30px rgba(0,0,0,0.5)' };
export function Grabber({ onClose }: { onClose: () => void }) {
  return <button onClick={onClose} aria-label="Stäng" style={{ display: 'flex', justifyContent: 'center', border: 'none', background: 'none', padding: `${AVSTAND.xs}px 0`, cursor: 'pointer' }}><div style={{ width: 36, height: 5, borderRadius: 3, background: '#48484a' }} /></button>;
}
