'use client';

// LARMKORTET i körvyn och skotarläget: ETT kort högst upp med namn och meter som räknas ner live. Ingen knapp — det försvinner av sig självt
// när man passerat eller lämnat ytan. Inom 15 m (bara Röd) pulserar det. Färgen kommer från larmmodulen (lib/larm/grupper), aldrig härifrån.
// Kvitteringen ("Sett <Namn>") är en smal rad längst ner (SettRad) — inte en knapp i kortet.

import React from 'react';
import type { LarmKort as Kort, LarmNasta } from '@/lib/larm/larm';
import type { FargGrupp } from '@/lib/larm/grupper';
import { AVSTAND, FARG, RADIE, TNUM, TYP, designCss, medSafeBotten } from '@/lib/design/tokens';

/** Ikonen följer gruppen (formen bär betydelsen när färgen inte syns i solljus). */
const IKON: Record<FargGrupp, string> = {
  fara: 'warning', natur: 'forest', kultur: 'museum', blott: 'water_drop', att_gora: 'content_cut', info: 'info',
};

/**
 * Raden under det stora kortet: "+ Namn · kommentar  18 m" när ETT annat larm väntar, "+N till" när fler väntar. Aldrig ett andra stort kort.
 * Färgen är bara en prick bredvid namnet — ordet bär betydelsen.
 */
function NastaRad({ nasta }: { nasta: LarmNasta }) {
  const r = nasta.rad;
  return (
    <div
      data-testid="larm-nasta"
      data-grupp={r?.grupp ?? 'flera'}
      style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, paddingTop: AVSTAND.s, borderTop: `1px solid ${FARG.linje}`, color: FARG.text2, ...TYP.text }}
    >
      {r ? (
        <>
          <span aria-hidden="true" style={{ width: AVSTAND.s + AVSTAND.xs, height: AVSTAND.s + AVSTAND.xs, borderRadius: RADIE.cirkel, background: r.farg, flexShrink: 0 }} />
          <span data-testid="larm-nasta-text" style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {`+ ${r.namn}${r.text ? ` · ${r.text}` : ''}`}
          </span>
          {r.avstandM != null && <span data-testid="larm-nasta-meter" style={{ flexShrink: 0, ...TNUM }}>{r.avstandM} m</span>}
        </>
      ) : (
        <span data-testid="larm-nasta-text">{`+${nasta.fler} till`}</span>
      )}
    </div>
  );
}

export function LarmKortVy({ kort, riktning, top, nasta }: { kort: Kort; riktning: string | null; top: string; nasta?: LarmNasta | null }) {
  const rad2 = kort.text ?? (riktning && kort.avstandM != null ? riktning : null);
  return (
    <div style={{ position: 'fixed', left: AVSTAND.m, right: AVSTAND.m, top, zIndex: 620, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <style>{designCss}</style>
      <div
        role="alert"
        aria-live="assertive"
        data-testid="larm-kort"
        data-grupp={kort.grupp}
        data-pulserar={kort.pulserar ? 'ja' : 'nej'}
        data-forbjuden={kort.forbjuden ? 'ja' : 'nej'}
        style={{
          position: 'relative', width: '100%', maxWidth: 560, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: AVSTAND.s, padding: `${AVSTAND.m}px ${AVSTAND.m}px ${AVSTAND.m}px ${AVSTAND.l}px`,
          background: FARG.kort, border: `3px solid ${kort.farg}`, borderRadius: RADIE.sheet, color: FARG.text, pointerEvents: 'auto',
          boxShadow: '0 16px 50px rgba(0,0,0,0.7)',
        }}
      >
        {/* Inom 15 m (bara Röd): en ram runt kortet pulserar (designCss .puls — opacity, texten i kortet står still och går att läsa). */}
        {kort.pulserar && (
          <span aria-hidden="true" data-testid="larm-puls" className="puls" style={{ position: 'absolute', inset: -AVSTAND.s, border: `${AVSTAND.s}px solid ${kort.farg}`, borderRadius: RADIE.sheet + AVSTAND.s, pointerEvents: 'none' }} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.l }}>
          <span aria-hidden="true" style={{ width: 52, height: 52, flexShrink: 0, borderRadius: RADIE.kort, background: kort.farg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 30, color: FARG.text }}>{kort.forbjuden ? 'block' : IKON[kort.grupp]}</span>
          </span>
          <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
            <span style={{ ...TYP.rubrik, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kort.namn}</span>
            {rad2 && <span style={{ ...TYP.text, color: FARG.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rad2}</span>}
          </span>
          {kort.avstandM != null && (
            <span data-testid="larm-meter" style={{ flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 4, paddingRight: AVSTAND.s }}>
              <span style={{ ...TYP.tal }}>{kort.avstandM}</span>
              <span style={{ ...TYP.listtitel, color: FARG.text2 }}>m</span>
            </span>
          )}
        </div>
        {nasta && <NastaRad nasta={nasta} />}
      </div>
    </div>
  );
}

const PLUS_ZON_PX = 72;
const PLUS_OVER_PX = 20 + 44 + AVSTAND.s;

/** Minsta höjd på Sett-knappen: tummen i en skakande hytt, ofta med handske. */
export const SETT_KNAPP_MIN_PX = 56;

/**
 * Raden längst ner: namnet på det som larmar och en STOR knapp "✓ Sett". Samma plats som kvittot (KorvyKvitto): bredvid plus-knappen, på telefon
 * ovanför den. Knappen är den enda träffytan (raden är bara text), så en trasig tumträff på namnet kvitterar aldrig något.
 */
export function SettRad({ namn, farg, smal, onSett }: { namn: string; farg: string; smal: boolean; onSett: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', left: AVSTAND.s, right: smal ? AVSTAND.s : PLUS_ZON_PX, zIndex: 590, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        bottom: smal ? `calc(${PLUS_OVER_PX}px + env(safe-area-inset-bottom, 0px))` : medSafeBotten(AVSTAND.l + AVSTAND.xs),
      }}
    >
      <div
        data-testid="larm-sett-rad"
        style={{
          pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', maxWidth: 520, boxSizing: 'border-box', padding: AVSTAND.xs, paddingLeft: AVSTAND.l,
          border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet, background: FARG.kort, color: FARG.text,
        }}
      >
        <span aria-hidden="true" style={{ width: AVSTAND.m, height: AVSTAND.m, borderRadius: RADIE.cirkel, background: farg, flexShrink: 0 }} />
        <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...TYP.listtitel }}>{namn}</span>
        <button
          type="button"
          data-testid="larm-sett"
          aria-label={`Sett ${namn}`}
          onClick={() => { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8); onSett(); }}
          className="press-dim"
          style={{
            flexShrink: 0, minWidth: 124, minHeight: SETT_KNAPP_MIN_PX, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.s, padding: `0 ${AVSTAND.l}px`,
            border: 'none', borderRadius: RADIE.knapp, background: FARG.text, color: FARG.bg, fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation', ...TYP.rubrik,
          }}
        >
          <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: 26 }}>check</span>
          <span>Sett</span>
        </button>
      </div>
    </div>
  );
}
