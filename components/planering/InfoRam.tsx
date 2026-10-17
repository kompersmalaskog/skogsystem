'use client';

// RAMEN för objektinfon: ett ark nerifrån under 900 px och en panel från höger från 900 px — SAMMA regel och samma rörelse som objektlistan och
// plus-arket (lib/plusArk.plusLage, lib/hooks/useSkarmLage, RORELSE.byte). Ingen mörk bakgrund och ingen fångst över kartan: kartan går att
// panorera och zooma medan kortet är öppet. Stängs med ×, Esc eller (telefon) genom att dra ned arket.
//
// Telefon: kortet öppnas på HALV höjd och dras upp till nästan full (grepp överst, samma `valjListdetent`/`dragHojd` som objektlistan); "Om trakten"
// och "Mer" är egna ark och öppnas på full höjd. Bred skärm: panelen är 380 px och visar allt — ingen halv höjd.
// Ramen vet inget om vad den visar: innehållet kommer som en funktion av läget (`lage`) och höjden (`detent`).

import React, { useEffect, useRef, useState } from 'react';
import { AVSTAND, FARG, RADIE, RORELSE, medSafeBotten } from '@/lib/design/tokens';
import { PANEL_BREDD_PX, dragHojd, valjListdetent, type Detent, type PlusLage } from '@/lib/plusArk';
import { useSkarmLage } from '@/lib/hooks/useSkarmLage';
import { ARK_HOJD_PROCENT } from '@/lib/objektKarta';

export type InfoVy = 'kort' | 'om' | 'mer' | 'klar';

export interface InfoRamProps {
  oppen: boolean;
  vy: InfoVy;
  ariaLabel: string;
  onStang: () => void;
  children: (ctx: { lage: PlusLage; detent: Detent }) => React.ReactNode;
}

const GREPP_HOJD_PX = AVSTAND.xl + AVSTAND.xs;
const DRAG_START_PX = 8;

const minskadRorelse = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function InfoRam({ oppen, vy, ariaLabel, onStang, children }: InfoRamProps) {
  const lage = useSkarmLage(oppen);
  const [inne, setInne] = useState(false);
  const [utglidet, setUtglidet] = useState(!oppen);   // monterad stängd (sidan lämnar den monterad) → inget i DOM
  const [detent, setDetent] = useState<Detent>(vy === 'kort' ? 'halv' : 'hel');
  const [dragPx, setDragPx] = useState<number | null>(null);
  const drag = useRef<{ y0: number; h0: number; flyttat: boolean } | null>(null);
  const arkRef = useRef<HTMLDivElement>(null);
  const stangRef = useRef(onStang);
  stangRef.current = onStang;

  // Varje öppning börjar rent: rörelsen in från kanten, kortet på halv höjd.
  useEffect(() => {
    if (!oppen) return;
    setDetent(vy === 'kort' ? 'halv' : 'hel');
    setDragPx(null);
    setUtglidet(false);
    if (minskadRorelse()) { setInne(true); return; }
    setInne(false);
    const id = requestAnimationFrame(() => setInne(true));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppen]);

  // Byter vy (kort → Om trakten → Mer): egna ark på full höjd, tillbaka till kortet på halv.
  useEffect(() => { if (oppen) { setDetent(vy === 'kort' ? 'halv' : 'hel'); setDragPx(null); } }, [vy, oppen]);

  // Utglidningen klar → ta bort ur DOM.
  useEffect(() => {
    if (oppen) return;
    setInne(false);
    const t = setTimeout(() => setUtglidet(true), minskadRorelse() ? 0 : RORELSE.byte + 50);
    return () => clearTimeout(t);
  }, [oppen]);

  // Esc stänger (inte ovanpå appens egen bekräftelsedialog).
  useEffect(() => {
    if (!oppen) return;
    const tangent = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) { e.preventDefault(); stangRef.current(); }
    };
    window.addEventListener('keydown', tangent);
    return () => window.removeEventListener('keydown', tangent);
  }, [oppen]);

  if (utglidet && !oppen) return null;

  const draggbar = lage === 'ark';
  const fonsterH = () => (typeof window !== 'undefined' ? window.innerHeight : 800);
  const arkHojd = dragPx != null ? `${dragPx}px`
    : detent === 'hel' ? `calc(100% - env(safe-area-inset-top, 0px) - ${AVSTAND.s}px)`
    : ARK_HOJD_PROCENT;
  const gripDown = (e: React.PointerEvent) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
    drag.current = { y0: e.clientY, h0: arkRef.current?.getBoundingClientRect().height || fonsterH() / 2, flyttat: false };
  };
  const gripMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dy = e.clientY - d.y0;
    if (Math.abs(dy) > DRAG_START_PX) d.flyttat = true;
    if (d.flyttat) setDragPx(dragHojd(d.h0, dy, fonsterH()));
  };
  const gripUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    setDragPx(null);
    if (!d) return;
    if (!d.flyttat) { setDetent(detent === 'halv' ? 'hel' : 'halv'); return; }   // tryck på greppet växlar halv ↔ hel
    const nasta = valjListdetent(detent, e.clientY - d.y0, true);
    if (nasta === 'stang') onStang(); else setDetent(nasta);
  };

  const glidInne = oppen && inne;
  const ram: React.CSSProperties = lage === 'panel'
    ? {
        top: `calc(env(safe-area-inset-top, 0px) + ${AVSTAND.s}px)`, right: AVSTAND.s, bottom: `calc(env(safe-area-inset-bottom, 0px) + ${AVSTAND.s}px)`,
        width: `min(${PANEL_BREDD_PX}px, calc(100vw - ${2 * AVSTAND.s}px))`, borderRadius: RADIE.sheet, border: `1px solid ${FARG.linje}`,
        transform: glidInne ? 'translateX(0)' : `translateX(calc(100% + ${2 * AVSTAND.s}px))`,
      }
    : {
        left: 0, right: 0, bottom: 0, height: arkHojd, maxHeight: '100%', borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`, borderTop: `1px solid ${FARG.linje}`,
        transform: glidInne ? 'translateY(0)' : 'translateY(100%)',
      };
  const overgang = minskadRorelse() ? 'none'
    : dragPx != null ? `transform ${RORELSE.byte}ms ${RORELSE.kurva}`
    : `transform ${RORELSE.byte}ms ${RORELSE.kurva}, height ${RORELSE.sheet}ms ${RORELSE.kurva}`;

  return (
    <div
      role="dialog"
      aria-label={ariaLabel}
      data-testid="objekt-info"
      data-lage={lage}
      data-vy={vy}
      data-detent={draggbar ? detent : undefined}
      data-oppen={oppen ? '1' : '0'}
      aria-hidden={oppen ? undefined : true}
      ref={arkRef}
      style={{ position: 'fixed', zIndex: 650, boxSizing: 'border-box', background: FARG.kort, color: FARG.text, fontFamily: 'inherit', display: 'flex', flexDirection: 'column', overscrollBehavior: 'contain',
        pointerEvents: oppen ? 'auto' : 'none', transition: overgang, ...ram }}
    >
      {draggbar && (
        <button type="button" aria-label={detent === 'halv' ? 'Dra upp' : 'Dra ned'} data-testid="objekt-info-grepp"
          onPointerDown={gripDown} onPointerMove={gripMove} onPointerUp={gripUp} onPointerCancel={() => { drag.current = null; setDragPx(null); }}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: GREPP_HOJD_PX, padding: 0, border: 'none', background: 'transparent', cursor: 'grab', touchAction: 'none' }}>
          <span style={{ width: AVSTAND.xxl + AVSTAND.s, height: AVSTAND.xs, borderRadius: AVSTAND.xs, background: FARG.text3 }} />
        </button>
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingTop: lage === 'panel' ? AVSTAND.l : 0 }}>
        {children({ lage, detent })}
      </div>
      {/* safe-area under innehållet (ett ark ritas annars in i hemindikatorn) */}
      {lage === 'ark' && <div aria-hidden="true" style={{ flexShrink: 0, height: 0, paddingBottom: medSafeBotten(0) }} />}
    </div>
  );
}
