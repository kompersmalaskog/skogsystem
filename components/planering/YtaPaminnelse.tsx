'use client';

// PÅMINNELSEN I YTAN (Martin 2026-10-22): föraren har redan sett instruktionen och kör in i ytan igen →
//   en pill högst upp [Övrigt 4] kort text › i ca 10 sekunder, sedan krymper den (mjukt) till bara brickan som ligger kvar så länge man är i ytan.
//   Inget ljud, ingen knapp. Tryck → hela instruktionen utan Sett. Kör man ut försvinner den; kör man in igen visas hela pillen 10 sekunder igen.
// Larm och lossningskort går före: sidan visar inte påminnelsen medan de visas (lib/instruktioner paminnelseAttVisa, `blockerad`).
// Ren presentation: reglerna (vilken yta, hur länge) ligger i lib/instruktioner; här är bara utseendet och krympningen.

import React from 'react';
import { AVSTAND, FARG, RADIE, RORELSE, TRAFFYTA, TYP, designCss } from '@/lib/design/tokens';
import type { Paminnelse } from '@/lib/instruktioner/instruktioner';
import { Pil } from './infoDelar';
import { YtaBricka } from './YtaRad';

const minskadRorelse = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function YtaPaminnelseVy({ paminnelse: p, top, onTryck }: { paminnelse: Paminnelse; top: string; onTryck: () => void }) {
  const full = p.fas === 'full';
  const ovg = minskadRorelse() ? 'none' : `max-width ${RORELSE.sheet}ms ${RORELSE.kurva}, opacity ${RORELSE.byte}ms ${RORELSE.kurva}, padding ${RORELSE.sheet}ms ${RORELSE.kurva}, background-color ${RORELSE.sheet}ms ${RORELSE.kurva}, border-color ${RORELSE.sheet}ms ${RORELSE.kurva}`;
  return (
    <div style={{ position: 'fixed', left: AVSTAND.m, right: AVSTAND.m, top, zIndex: 615, display: 'flex', justifyContent: 'flex-start', pointerEvents: 'none' }}>
      <style>{designCss}</style>
      <button
        type="button"
        data-testid="yta-paminnelse"
        data-fas={p.fas}
        data-nyckel={p.nyckel}
        onClick={onTryck}
        aria-label={`${p.bricka}${p.typ ? ` ${p.typ}` : ''}${p.text ? `: ${p.text}` : ''}. Visa hela instruktionen`}
        className="press-scale"
        style={{
          pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s, maxWidth: '100%', minHeight: TRAFFYTA.min, boxSizing: 'border-box',
          padding: full ? `${AVSTAND.xs}px ${AVSTAND.m}px ${AVSTAND.xs}px ${AVSTAND.xs}px` : 0, border: `1px solid ${full ? FARG.linje : 'transparent'}`, borderRadius: RADIE.sheet,
          background: full ? FARG.kort : 'transparent', color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation', transition: ovg,
          boxShadow: full ? '0 8px 30px rgba(0,0,0,0.6)' : 'none',
        }}
      >
        <span style={{ filter: full ? 'none' : 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))', display: 'inline-flex' }}><YtaBricka bricka={p.bricka} grupp={p.brickaGrupp} testid="yta-paminnelse-bricka" /></span>
        <span
          data-testid="yta-paminnelse-text"
          aria-hidden={!full}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap',
            maxWidth: full ? 'min(420px, calc(100vw - 150px))' : 0, opacity: full ? 1 : 0, transition: ovg, ...TYP.text,
          }}
        >
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.text}</span>
          <Pil />
        </span>
      </button>
    </div>
  );
}
