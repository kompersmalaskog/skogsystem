'use client';
// Gå-läget när man snitslar: EN SMAL RAD HÖGST UPP (skog mellan vägkanterna + ett ord), kartan med bandet att gå i under (Martin 2026-11-13). Panelen är ogenomskinlig och ligger överst;
// sidan lägger kartans mitt under den (onHojd) och följer positionen. Regler och texter i lib/snitselPanel.ts.
import { useEffect, useRef, type ReactNode } from 'react';
import { FARG, FONT, TYP, AVSTAND, VIKT, TRAFFYTA } from '@/lib/design/tokens';
import { snitselGpsText, snitselRiktning, snitselTon, type SnitselLage } from '@/lib/snitselPanel';

export interface SnitselPanelProps extends SnitselLage {
  gpsNoggrannhetM: number | null;
  /** Vilken väg man mäter mot (lås/auto) — ritas av sidan. */
  chip?: ReactNode;
  /** Snitselfärgen (pillen till höger) — ritas av sidan. */
  farg?: ReactNode;
  /** "mäter mot röd" när referensen just bytts. */
  bytt?: string | null;
  /** Bandet ligger på fel sida om vägen → byt. Saknas = ingen knapp (inget band). */
  onBytSida?: () => void;
  onHojd?: (px: number) => void;
}

export function SnitselPanel(p: SnitselPanelProps) {
  const rot = useRef<HTMLDivElement | null>(null);
  const onHojd = useRef(p.onHojd); onHojd.current = p.onHojd;
  useEffect(() => {
    const el = rot.current;
    if (!el) return;
    const mat = () => onHojd.current?.(Math.round(el.getBoundingClientRect().height));
    mat();
    let ro: ResizeObserver | null = null;
    try { ro = new ResizeObserver(mat); ro.observe(el); } catch { /* äldre webbläsare: höjden mäts en gång */ }
    return () => { try { ro?.disconnect(); } catch { /* */ } };
  }, []);

  const ton = snitselTon(p);
  const farg = ton === 'inom' ? FARG.gron : ton === 'utanfor' ? FARG.orange : FARG.text;
  const gps = snitselGpsText(p.gpsNoggrannhetM);
  return (
    <div ref={rot} data-testid="snitsel-panel" data-ton={ton} style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 550, background: FARG.bg, color: FARG.text, fontFamily: FONT,
      paddingTop: `calc(env(safe-area-inset-top, 0px) + ${AVSTAND.s}px)`, paddingBottom: AVSTAND.m,
      paddingLeft: `max(${AVSTAND.l}px, env(safe-area-inset-left, 0px))`, paddingRight: `max(${AVSTAND.l}px, env(safe-area-inset-right, 0px))`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.m, flexWrap: 'wrap' }}>
        {/* Skogen mellan vägkanterna. Ska gå att läsa med telefonen i handen medan man går — medvetet större än TYP.tal. */}
        <div data-testid="snitsel-meter" style={{ fontSize: 'clamp(48px, 14vw, 64px)', fontWeight: VIKT.fet, lineHeight: 1, color: farg, fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px' }}>
          {p.dist == null ? '–' : p.dist}
          <span style={{ ...TYP.rubrik, color: FARG.text2, marginLeft: AVSTAND.xs }}>m</span>
        </div>
        <div data-testid="snitsel-riktning" style={{ ...TYP.rubrik, color: farg }}>{snitselRiktning(p)}</div>
        {p.farg && <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>{p.farg}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: AVSTAND.m, marginTop: AVSTAND.s }}>
        {p.chip}
        <span data-testid="snitsel-gps" style={{ ...TYP.meta, color: gps.osaker ? FARG.orange : FARG.text2 }}>{gps.text}</span>
        {p.onBytSida && (
          <button type="button" data-testid="snitsel-byt-sida" onClick={p.onBytSida} style={{
            marginLeft: 'auto', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.s}px`, background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', ...TYP.meta, color: FARG.bla,
          }}>Byt sida</button>
        )}
      </div>
      {p.bytt && <div style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.xs }}>Mäter nu mot {p.bytt}</div>}
    </div>
  );
}
