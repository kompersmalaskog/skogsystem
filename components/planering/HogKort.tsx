'use client';

// KORTET NÄR MAN TRYCKER PÅ EN HÖG (Martin 2026-11-06, design A: "så lätt att ett barn förstår direkt").
// Överst hur mycket som ligger kvar, under det vad det mest är, en stapel med fördelningen och en rad per
// sortiment med siffran till höger. Tre lika stora knappar: Stäng · Tagen (vit) · Ligger kvar.
// Färgerna är appens sortimentfärger (SORTIMENTFARG, samma som maskinvyn och markägarrapporten); färgen bär
// aldrig ensam — namnet och talet står alltid bredvid. Ligger på samma plats som listen nertill (KorvyNertillList).

import React from 'react';
import { AVSTAND, FARG, RADIE, SORTIMENTFARG, TYP, medSafeBotten } from '@/lib/design/tokens';
import type { HogGrupp, HogGruppKvar } from '@/lib/skotarHogarKvar';

const KNAPP_HOJD_PX = 52;
const PLUS_ZON_PX = 72;
const PLUS_OVER_PX = 20 + 44 + AVSTAND.s;
const STAPEL_HOJD_PX = 14;

export const HOG_GRUPP_FARG: Record<HogGrupp, string> = {
  timmer: SORTIMENTFARG.timmer,
  kubb: SORTIMENTFARG.kubb,
  massa: SORTIMENTFARG.massa,
  energi: SORTIMENTFARG.ovrigt,
  ovrigt: SORTIMENTFARG.ovrigt,
};

export function m3Text(v: number): string {
  return v.toFixed(1).replace('.', ',');
}

/** "Mest massaved" — bara när högen har mer än ett sortiment. */
export function mestText(grupper: HogGruppKvar[]): string | null {
  if (grupper.length < 2) return null;
  return `Mest ${grupper[0].namn.toLowerCase()}`;
}

export function HogKort({ titel, grupper, smal, onStang, onTagen, onKvar }: {
  titel: string;
  /** Sortimenten i högen, störst först. Saknas när ett enda sortiment visas (då står bara titeln). */
  grupper?: HogGruppKvar[];
  smal: boolean;
  onStang: () => void;
  onTagen: () => void;
  onKvar: () => void;
}) {
  const g = grupper && grupper.length > 0 ? grupper : null;
  const mest = g ? mestText(g) : null;
  const knapp = (etikett: string, testid: string, onClick: () => void, primar = false) => (
    <button type="button" data-testid={testid} onClick={onClick} className="press-dim"
      style={{ flex: '1 1 0', minWidth: 0, height: KNAPP_HOJD_PX, border: 'none', borderRadius: RADIE.knapp, fontFamily: 'inherit', ...TYP.listtitel, cursor: 'pointer',
        background: primar ? FARG.text : FARG.fyllning, color: primar ? FARG.bg : FARG.text }}>
      {etikett}
    </button>
  );
  return (
    <div data-testid="hog-kort"
      style={{
        position: 'fixed', left: AVSTAND.s, right: smal ? AVSTAND.s : PLUS_ZON_PX, zIndex: 600, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        bottom: smal ? `calc(${PLUS_OVER_PX}px + env(safe-area-inset-bottom, 0px))` : medSafeBotten(AVSTAND.l + AVSTAND.xs),
      }}>
      <div role="status"
        style={{
          pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: AVSTAND.m, width: '100%', maxWidth: 560, boxSizing: 'border-box',
          padding: AVSTAND.l, background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet, color: FARG.text, fontFamily: 'inherit',
        }}>
        <div>
          <div data-testid="hog-kort-titel" style={{ ...TYP.titel }}>{titel}</div>
          {mest && <div data-testid="hog-kort-mest" style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs }}>{mest}</div>}
        </div>
        {g && (
          <>
            <div data-testid="hog-kort-stapel" aria-hidden="true" style={{ display: 'flex', gap: 2, height: STAPEL_HOJD_PX, borderRadius: STAPEL_HOJD_PX / 2, overflow: 'hidden' }}>
              {g.map((r) => (
                <div key={r.grupp} style={{ flex: `${Math.max(r.m3, 0.01)} 1 0`, background: HOG_GRUPP_FARG[r.grupp],
                  boxShadow: r.grupp === 'timmer' ? `inset 0 0 0 1px ${FARG.linje}` : undefined }} />
              ))}
            </div>
            <div data-testid="hog-kort-innehall" style={{ display: 'flex', flexDirection: 'column' }}>
              {g.map((r, i) => (
                <div key={r.grupp} data-testid={`hog-kort-rad-${r.grupp}`}
                  style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: 44, borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
                  <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0, background: HOG_GRUPP_FARG[r.grupp], boxShadow: `inset 0 0 0 1px ${FARG.linje}` }} />
                  <span style={{ ...TYP.text, flex: 1, minWidth: 0 }}>{r.namn}</span>
                  <span style={{ ...TYP.text, fontVariantNumeric: 'tabular-nums' }}>{m3Text(r.m3)} m³</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: AVSTAND.s }}>
          {knapp('Stäng', 'hog-kort-stang', onStang)}
          {knapp('Tagen', 'hog-kort-tagen', onTagen, true)}
          {knapp('Ligger kvar', 'hog-kort-kvar', onKvar)}
        </div>
      </div>
    </div>
  );
}
