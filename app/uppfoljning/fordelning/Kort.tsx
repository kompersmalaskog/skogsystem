'use client';

/**
 * Kort.tsx — objektkortet (läge 1 tyst / läge 2 avvikelse) och avslutsraden.
 * Delas av fördelningsvyn och skärmdumps-harnessen så renderingen är identisk.
 */

import React, { useState } from 'react';
import type { ObjektVy } from './types';

const GREY = '#8e8e93';
const GREY2 = '#636366';
const CARD = '#1c1c1e';
const SEP = 'rgba(255,255,255,0.06)';
const WARN = '#ff9f0a';
const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif";

const kommatal = (n: number) => n.toString().replace('.', ',');
export const fmtGrad = (n: number | null) => (n == null ? '–' : `${kommatal(Math.round(n * 10) / 10)} %`);

/** Avslutspåminnelse: stilla rad, aktivt objekt utan fil på 14 dagar. */
export function Avslutsrad({ vy, onAvsluta }: { vy: ObjektVy; onAvsluta: (k: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, marginBottom: 8 }}>
      <span style={{ flex: 1, fontSize: 13, color: GREY }}>
        {vy.objektNamn} — ingen ny fil på {vy.dagarSedanFil} dagar. Ska den markeras som avslutad?
      </span>
      <button
        disabled={busy}
        onClick={async () => { setBusy(true); await onAvsluta(vy.objectKey); }}
        style={{ background: 'none', border: `1px solid ${SEP}`, color: '#fff', fontSize: 13, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        {busy ? '…' : 'Markera avslutad'}
      </button>
    </div>
  );
}

/** Objektkort: läge 1 (tyst grå) / läge 2 (avvikelse, varningsfärg + mening). */
export function Objektkort({ vy, onÖppna }: { vy: ObjektVy; onÖppna: (k: string) => void }) {
  const läge2 = vy.lage === 2;
  return (
    <button
      onClick={() => onÖppna(vy.objectKey)}
      style={{ display: 'block', width: '100%', textAlign: 'left', background: CARD, border: 'none', borderRadius: 12, padding: 16, marginBottom: 12, cursor: 'pointer', fontFamily: ff }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{vy.objektNamn}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: läge2 ? WARN : GREY, whiteSpace: 'nowrap' }}>
          {fmtGrad(vy.gradePct)}
        </span>
      </div>
      <div style={{ fontSize: 13, color: GREY, marginTop: 4 }}>
        {läge2 ? `Avvikelse · ${Math.round(vy.volymM3)} m³` : `Inom mål · ${Math.round(vy.volymM3)} m³`}
        {vy.trend && (
          <span style={{ color: GREY2, marginLeft: 8 }}>
            {vy.trend.to >= vy.trend.from ? '↑' : '↓'} från {kommatal(vy.trend.from)}
          </span>
        )}
      </div>
      {läge2 && vy.mening && (
        <div style={{ fontSize: 14, color: '#fff', marginTop: 10, lineHeight: 1.5 }}>{vy.mening}</div>
      )}
      {läge2 && (
        <div style={{ fontSize: 13, color: '#0a84ff', marginTop: 10 }}>Visa mer ›</div>
      )}
    </button>
  );
}
