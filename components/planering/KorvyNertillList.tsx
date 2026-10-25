'use client';

// SMAL LIST NERTILL (max 72 px) — EN komponent för tre lägen i körvyn/planeringen:
//   • placera:  "Tryck där Högstubbe ska stå  ·  Vid maskinen  ·  ×"
//   • figur:    "0,89 ha  ·  Ångra  ·  Klar  ·  ×"            (Mät/Rita)
//   • prick:    "Högstubbe  ·  Ta bort  ·  ×"                 (tryck på en prick)
// Ligger bredvid plus-knappen på bred skärm; ovanför den på telefon (annars får texten ingen plats). Allt via designtokens.

import React from 'react';
import { AVSTAND, FARG, RADIE, TYP, medSafeBotten } from '@/lib/design/tokens';

export const LIST_HOJD_PX = 72;
const KNAPP_HOJD_PX = LIST_HOJD_PX - 2 * AVSTAND.s;     // 56
const PLUS_ZON_PX = 72;                                  // plus-knappen: 16 från kanten + 44 bred + 12 luft
const PLUS_OVER_PX = 20 + 44 + AVSTAND.s;                // plus-knappens överkant (20 + 44) + luft

export interface NertillKnapp {
  etikett: string;
  onClick: () => void;
  testid: string;
  primar?: boolean;
  /** Stor grön "Klar"-knapp (mät/rita): bredare än de andra, grön fyllning. */
  gron?: boolean;
  destruktiv?: boolean;
  av?: boolean;
  /** Skärmläsarnamn när etiketten är en symbol (×). */
  aria?: string;
}

export interface NertillVal { id: string; etikett: string; vald: boolean; onClick: () => void; testid: string }

export function KorvyNertillList({ text, knappar, testid, smal, z = 600, stapla = false, val }: {
  text: React.ReactNode;
  knappar: NertillKnapp[];
  testid: string;
  /** telefon: listen ligger ovanför plus-knappen och tar hela bredden */
  smal: boolean;
  z?: number;
  /**
   * En fråga med två svar får inte plats på EN rad på en telefon: texten överst, svarsknapparna (alla utom den första) bredvid varandra under den och den första
   * knappen (vägen tillbaka) som en smal rad längst ner. Raden är då högre än 72 px.
   */
  stapla?: boolean;
  /** Ett val med ett tryck (t.ex. skäl): en rad knappar OVANFÖR listen, den valda fylld. Raden ändrar inte listen under den. */
  val?: NertillVal[];
}) {
  if (stapla) {
    const [tillbaka, ...svar] = knappar;
    return (
      <div
        data-testid={testid}
        style={{
          position: 'fixed', left: AVSTAND.s, right: smal ? AVSTAND.s : PLUS_ZON_PX, zIndex: z, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
          bottom: smal ? `calc(${PLUS_OVER_PX}px + env(safe-area-inset-bottom, 0px))` : medSafeBotten(AVSTAND.l + AVSTAND.xs),
        }}
      >
        <div
          role="status"
          style={{
            pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: AVSTAND.s, width: '100%', maxWidth: 560, boxSizing: 'border-box',
            padding: AVSTAND.s, background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet, color: FARG.text, fontFamily: 'inherit',
          }}
        >
          <div style={{ padding: `${AVSTAND.xs}px ${AVSTAND.s}px 0`, ...TYP.listtitel }}>{text}</div>
          <div style={{ display: 'flex', gap: AVSTAND.s }}>
            {svar.map((k, i) => (
              <button key={k.testid} type="button" data-testid={k.testid} aria-label={k.aria} disabled={k.av} onClick={k.onClick} className="press-dim"
                style={{ flex: i === 0 ? '1.4 1 0' : '1 1 0', minWidth: 0, height: KNAPP_HOJD_PX, padding: `0 ${AVSTAND.s}px`, border: 'none', borderRadius: RADIE.knapp, fontFamily: 'inherit', ...TYP.listtitel,
                  cursor: k.av ? 'default' : 'pointer', opacity: k.av ? 0.4 : 1, background: k.gron ? FARG.gron : k.primar ? FARG.text : FARG.fyllning, color: k.gron || k.primar ? FARG.bg : FARG.text }}>
                {k.etikett}
              </button>
            ))}
          </div>
          {tillbaka && (
            <button type="button" data-testid={tillbaka.testid} aria-label={tillbaka.aria} onClick={tillbaka.onClick} className="press-dim"
              style={{ height: 44, border: 'none', background: 'transparent', color: FARG.bla, fontFamily: 'inherit', ...TYP.text, cursor: 'pointer' }}>
              {tillbaka.etikett}
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div
      data-testid={testid}
      style={{
        position: 'fixed', left: AVSTAND.s, right: smal ? AVSTAND.s : PLUS_ZON_PX, zIndex: z, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        bottom: smal ? `calc(${PLUS_OVER_PX}px + env(safe-area-inset-bottom, 0px))` : medSafeBotten(AVSTAND.l + AVSTAND.xs),
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s, width: '100%', maxWidth: 560, pointerEvents: 'none' }}>
      {val && val.length > 0 && (
        <div data-testid={`${testid}-val`} role="group" style={{ pointerEvents: 'auto', display: 'flex', gap: AVSTAND.xs, padding: AVSTAND.xs, background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet }}>
          {val.map((v) => (
            <button key={v.id} type="button" data-testid={v.testid} aria-pressed={v.vald} onClick={v.onClick} className="press-dim"
              style={{ flex: '1 1 0', minWidth: 0, height: 44, padding: `0 ${AVSTAND.xs}px`, border: 'none', borderRadius: RADIE.knapp, fontFamily: 'inherit', ...TYP.listtitel, cursor: 'pointer',
                background: v.vald ? FARG.text : FARG.fyllning, color: v.vald ? FARG.bg : FARG.text }}>
              {v.etikett}
            </button>
          ))}
        </div>
      )}
      <div
        role="status"
        style={{
          pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: AVSTAND.s, width: '100%', maxWidth: 560, boxSizing: 'border-box',
          height: LIST_HOJD_PX, padding: AVSTAND.s, background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet,
          color: FARG.text, fontFamily: 'inherit',
        }}
      >
        <div
          style={{
            flex: '1 1 auto', minWidth: 0, paddingLeft: AVSTAND.s, ...TYP.listtitel, overflow: 'hidden',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}
        >
          {text}
        </div>
        {knappar.map((k) => (
          <button
            key={k.testid}
            type="button"
            data-testid={k.testid}
            aria-label={k.aria}
            disabled={k.av}
            onClick={k.onClick}
            className="press-dim"
            style={{
              // den gröna ✓ är dubbelt så bred bara på bred skärm; på telefon får texten platsen ("Ej framkomlig · 4 punkter" ska rymmas)
              flexShrink: 0, height: KNAPP_HOJD_PX, minWidth: k.gron && !smal ? KNAPP_HOJD_PX * 2 : KNAPP_HOJD_PX, padding: `0 ${k.gron && !smal ? AVSTAND.l : AVSTAND.m}px`, border: 'none', borderRadius: RADIE.knapp,
              fontFamily: 'inherit', ...TYP.listtitel, cursor: k.av ? 'default' : 'pointer', opacity: k.av ? 0.4 : 1,
              background: k.gron ? FARG.gron : k.primar ? FARG.text : FARG.fyllning, color: k.gron || k.primar ? FARG.bg : k.destruktiv ? FARG.rod : FARG.text,
            }}
          >
            {k.etikett}
          </button>
        ))}
      </div>
      </div>
    </div>
  );
}

/** × som avbryt/kasta — samma knapp överallt. */
export const AVBRYT_KNAPP = (onClick: () => void, testid = 'nertill-avbryt'): NertillKnapp => ({ etikett: '×', onClick, testid, aria: 'Avbryt' });
