'use client';

import React from 'react';
import { C, ff, STATUSINFO, TYPINFO } from './tema';
import { fmtDatum, fmtLangd } from './datum';
import type { Ansokan } from './typer';

/**
 * Ett ansökningskort. Egen väntande kan ändras/tas bort; godkänd/nekad är låst
 * (RLS tillåter bara egna ändringar medan status='väntar' — UI:t visar det i
 * stället för att låta användaren köra i en vägg).
 */
export default function AnsokanKort({
  a, visaNamn = false, arEgen = false, onRedigera, onTaBort, onHantera, hanterar = false,
}: {
  a: Ansokan;
  visaNamn?: boolean;
  arEgen?: boolean;
  onRedigera?: (a: Ansokan) => void;
  onTaBort?: (a: Ansokan) => void;
  onHantera?: (a: Ansokan, status: 'godkänd' | 'nekad') => void;
  hanterar?: boolean;
}) {
  const ti = TYPINFO[a.typ] ?? TYPINFO.semester;
  const si = STATUSINFO[a.status] ?? STATUSINFO['väntar'];
  const kanAndras = arEgen && a.status === 'väntar';

  const litenKnapp: React.CSSProperties = {
    background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.t2, fontSize: 12, fontWeight: 500, cursor: 'pointer',
    fontFamily: ff, padding: '6px 12px',
  };

  return (
    <div style={{
      background: C.surface2, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '14px 16px', fontFamily: ff,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: ti.color }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: C.t1 }}>
            {visaNamn && `${a.anvandare_id} · `}{ti.label}
          </span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 10px',
          borderRadius: 20, color: si.color, background: si.bg,
        }}>
          {si.label}
        </span>
      </div>

      <div style={{ fontSize: 13, color: C.t2 }}>
        {fmtDatum(a.startdatum)} – {fmtDatum(a.slutdatum)} · {fmtLangd(a.startdatum, a.slutdatum)}
      </div>

      {a.kommentar && (
        <div style={{ fontSize: 12, color: C.t3, marginTop: 6, fontStyle: 'italic' }}>
          &quot;{a.kommentar}&quot;
        </div>
      )}

      {kanAndras && (onRedigera || onTaBort) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {onRedigera && <button onClick={() => onRedigera(a)} style={litenKnapp}>Ändra</button>}
          {onTaBort && <button onClick={() => onTaBort(a)} style={{ ...litenKnapp, color: C.red, borderColor: 'rgba(239,68,68,0.3)' }}>Ta bort</button>}
        </div>
      )}

      {arEgen && a.status === 'godkänd' && (
        <div style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>
          Låst — ändringar går via admin
        </div>
      )}

      {onHantera && a.status === 'väntar' && (
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button disabled={hanterar} onClick={() => onHantera(a, 'godkänd')} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
            background: C.green, color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: ff, opacity: hanterar ? 0.5 : 1,
          }}>
            Godkänn
          </button>
          <button disabled={hanterar} onClick={() => onHantera(a, 'nekad')} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
            background: C.redDim, color: C.red, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: ff, opacity: hanterar ? 0.5 : 1,
          }}>
            Neka
          </button>
        </div>
      )}
    </div>
  );
}
