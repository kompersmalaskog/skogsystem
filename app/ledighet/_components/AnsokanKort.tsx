'use client';

import React from 'react';
import { C, ff, TYPINFO } from './tema';
import { arbetsdagar, fmtPeriod } from './datum';
import type { Ansokan } from './typer';

// === Små statusikoner ===

function IkonKlocka({ color }: { color: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

function IkonBock({ color }: { color: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IkonKryss({ color }: { color: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IkonLas({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** "2 arbetsdagar · Semester" resp. "8 timmar · ATK" (ATK räknas i timmar). */
function fmtLangdTyp(a: Ansokan): string {
  const ad = arbetsdagar(a.startdatum, a.slutdatum);
  if (a.typ === 'atk') {
    const h = ad * 8;
    return `${h} timm${h === 1 ? 'e' : 'ar'} · ATK`;
  }
  return `${ad} arbetsdag${ad === 1 ? '' : 'ar'} · ${TYPINFO[a.typ]?.label ?? a.typ}`;
}

/**
 * Ansökningskort: perioden är rubriken, status läses på kantremsans färg
 * innan man läser ordet. Egen väntande kan ändras/tas bort; godkänd är låst
 * och SÄGER det (hänglås-rad) i stället för att visa tomt.
 */
export default function AnsokanKort({
  a, visaNamn = false, arEgen = false, tidigare = false,
  onRedigera, onTaBort, onHantera, hanterar = false,
}: {
  a: Ansokan;
  visaNamn?: boolean;
  arEgen?: boolean;
  tidigare?: boolean;
  onRedigera?: (a: Ansokan) => void;
  onTaBort?: (a: Ansokan) => void;
  onHantera?: (a: Ansokan, status: 'godkänd' | 'nekad') => void;
  hanterar?: boolean;
}) {
  // Badge: ikon + etikett ("Togs ut" för avslutad godkänd period)
  const badge = a.status === 'godkänd'
    ? { label: tidigare ? 'Togs ut' : 'Godkänd', color: tidigare ? C.t3 : C.green, bg: tidigare ? 'rgba(156,163,175,0.12)' : C.greenDim, ikon: <IkonBock color={tidigare ? C.t3 : C.green} /> }
    : a.status === 'nekad'
      ? { label: 'Nekad', color: C.nekad, bg: C.nekadDim, ikon: <IkonKryss color={C.nekad} /> }
      : { label: 'Väntar', color: C.yellow, bg: C.yellowDim, ikon: <IkonKlocka color={C.yellow} /> };

  // Kantremsa: status-färg, grå för tidigare
  const remsa = tidigare ? 'rgba(156,163,175,0.5)'
    : a.status === 'godkänd' ? C.green
    : a.status === 'nekad' ? C.nekad
    : C.yellow;

  const kanAndras = arEgen && a.status === 'väntar';

  const litenKnapp: React.CSSProperties = {
    background: 'none', border: 'none', borderRadius: 8,
    color: C.t2, fontSize: 13, fontWeight: 500, cursor: 'pointer',
    fontFamily: ff, padding: '8px 12px',
  };

  return (
    <div style={{
      background: C.surface2, border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${remsa}`,
      borderRadius: 12, padding: '13px 16px', fontFamily: ff,
      opacity: tidigare ? 0.65 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          {visaNamn && (
            <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, letterSpacing: '0.02em', marginBottom: 2 }}>
              {a.anvandare_id}
            </div>
          )}
          {/* Perioden är rubriken — det man letar efter */}
          <div style={{ fontSize: 17, fontWeight: 700, color: C.t1, lineHeight: 1.2 }}>
            {fmtPeriod(a.startdatum, a.slutdatum)}
          </div>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 3 }}>
            {fmtLangdTyp(a)}
          </div>
        </div>

        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
          fontSize: 11, fontWeight: 600, padding: '4px 10px',
          borderRadius: 20, color: badge.color, background: badge.bg,
        }}>
          {badge.ikon}{badge.label}
        </span>
      </div>

      {a.kommentar && (
        <div style={{ fontSize: 12, color: C.t3, marginTop: 8, fontStyle: 'italic' }}>
          &quot;{a.kommentar}&quot;
        </div>
      )}

      {/* Väntande: handlingar under tunn avdelare */}
      {kanAndras && (onRedigera || onTaBort) && (
        <>
          <div style={{ height: 1, background: C.border, margin: '11px -16px 2px' }} />
          <div style={{ display: 'flex', gap: 4, marginLeft: -12 }}>
            {onRedigera && <button onClick={() => onRedigera(a)} style={litenKnapp}>Ändra</button>}
            {onTaBort && <button onClick={() => onTaBort(a)} style={{ ...litenKnapp, color: C.red }}>Ta bort</button>}
          </div>
        </>
      )}

      {/* Godkänd (kommande): förklara låset, visa inte bara tomt */}
      {arEgen && a.status === 'godkänd' && !tidigare && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9 }}>
          <IkonLas color={C.t3} />
          <span style={{ fontSize: 11, color: C.t3 }}>Låst — ändringar går via admin</span>
        </div>
      )}

      {/* Godkännar-läge (väntande i godkänn-listan) */}
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
