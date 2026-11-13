'use client';
// Gå-läget när man snitslar: METER STORT HÖGST UPP, kartan syns under (Martin 2026-11-13). Panelen är ogenomskinlig och ligger överst;
// sidan lägger kartans mitt under den (onHojd) och följer positionen. Regler och texter i lib/snitselPanel.ts.
import { useEffect, useRef, type ReactNode } from 'react';
import { FARG, FONT, TYP, AVSTAND, VIKT, RADIE } from '@/lib/design/tokens';
import { snitselGpsText, snitselMatare, snitselRiktning, snitselTon, type SnitselLage } from '@/lib/snitselPanel';

export interface SnitselPanelProps extends SnitselLage {
  gpsNoggrannhetM: number | null;
  /** Vilken väg man mäter mot (lås/auto) — ritas av sidan. */
  chip?: ReactNode;
  /** "mäter mot röd" när referensen just bytts. */
  bytt?: string | null;
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
  const m = snitselMatare(p);
  const gps = snitselGpsText(p.gpsNoggrannhetM);
  const H = 12;
  return (
    <div ref={rot} data-testid="snitsel-panel" data-ton={ton} style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 550, background: FARG.bg, color: FARG.text, fontFamily: FONT,
      paddingTop: `calc(env(safe-area-inset-top, 0px) + ${AVSTAND.m}px)`, paddingBottom: AVSTAND.l,
      paddingLeft: `max(${AVSTAND.l}px, env(safe-area-inset-left, 0px))`, paddingRight: `max(${AVSTAND.l}px, env(safe-area-inset-right, 0px))`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
    }}>
      {/* Siffran är hela poängen: den ska gå att läsa med telefonen i handen medan man går. Medvetet större än TYP.tal. */}
      <div data-testid="snitsel-meter" style={{ fontSize: 'clamp(76px, 22vw, 120px)', fontWeight: VIKT.fet, lineHeight: 1, color: farg, fontVariantNumeric: 'tabular-nums', letterSpacing: '-2px' }}>
        {p.dist == null ? '–' : p.dist}
        <span style={{ ...TYP.rubrik, color: FARG.text2, marginLeft: AVSTAND.s }}>m</span>
      </div>
      <div data-testid="snitsel-riktning" style={{ ...TYP.rubrik, color: farg, marginTop: AVSTAND.s }}>{snitselRiktning(p)}</div>
      <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>Mål {p.target} m · ±{p.tol}</div>
      <div style={{ width: 'min(420px, 100%)', marginTop: AVSTAND.m }}>
        <div style={{ position: 'relative', height: H, borderRadius: RADIE.stapel, background: FARG.upphojt }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${m.bandFran}%`, width: `${m.bandTill - m.bandFran}%`, background: FARG.gron, opacity: 0.55, borderRadius: RADIE.stapel }} />
          {m.prick != null && (
            <div data-testid="snitsel-prick" style={{ position: 'absolute', top: '50%', left: `${m.prick}%`, transform: 'translate(-50%,-50%)', width: H + AVSTAND.s, height: H + AVSTAND.s, borderRadius: '50%', background: farg, border: `2px solid ${FARG.text}` }} />
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: AVSTAND.xs, ...TYP.meta, color: FARG.text3 }}>
          <span>För nära</span>
          {m.utanforSkala && <span style={{ color: FARG.orange }}>Utanför skalan</span>}
          <span>För långt</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: AVSTAND.m, marginTop: AVSTAND.s }}>
        {p.chip}
        <span data-testid="snitsel-gps" style={{ ...TYP.meta, color: gps.osaker ? FARG.orange : FARG.text2 }}>{gps.text}</span>
      </div>
      {p.bytt && <div style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.xs }}>Mäter nu mot {p.bytt}</div>}
    </div>
  );
}
