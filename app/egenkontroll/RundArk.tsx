'use client';

// RUNDARKET: ett ark som ligger NEDERST på kartan och kan dras upp. Dockan (brickorna) är arkets understa läge; Rundan-innehållet
// (listan, kommentaren, observationerna, stubbehandlingen, avslutet) ligger under brickorna och syns när arket dras upp.
//
// AVSTEG 4/7 FRÅN PLANERINGSVYN: ARKET STÄNGS ALDRIG — DOCKAN ÄR DET UNDERSTA LÄGET, OCH DET FINNS BARA TVÅ: DOCK OCH HEL.
// Planeringens ark (InfoRam) har halv och hel höjd och stängs genom att dras ned. Här stängs arket aldrig: brickorna ska alltid finnas kvar,
// så det understa läget är dockan (bara brickorna och raden för det markerade) och det övre är hel (dockan + Rundan-innehållet).
// Inget halvt läge: en bestämd andel av skärmen gav kartan 126 px (oanvändbart). Hel följer i stället sitt innehåll: kort innehåll lämnar
// kartan synlig ovanför, långt innehåll tar skärmen minus huvudet och scrollar (minst dock + HEL_MIN_INNEHALL_PX, högst max).
// Arket är alltid så högt som max och förskjuts nedåt med translateY, så ett läge är bara ett tal (hur många px som syns,
// lib/egenkontrollArk.ts) och kartans padding kan räknas exakt. Det dras i greppet (44 px hög träffyta) och bara där: brickorna och
// innehållet har egna tryck. Tryck på greppet växlar dock ↔ hel. Arket ligger nedtill på alla bredder (max KOLUMN.ark) — aldrig en panel från
// höger: den som går rundan har tummen nere, och en panel på sidan täcker kartan åt ena hållet.
//
// SAFE-AREA: arkets nederkant ligger vid skärmens nederkant (bottom 0) och dockans innehåll slutar med `medSafeBotten(AVSTAND.m)` =
// max(12 px, 8 px + env(safe-area-inset-bottom)), så den understa brickraden ligger alltid OVANFÖR hemindikatorn. Höjden som mäts (`toppRef`)
// inkluderar den paddingen, så dockan sitter exakt rätt utan att något räknar med ett antaget mått. Hel slutar under huvudet, som ligger på
// `env(safe-area-inset-top)` + 8 px (underKartHuvud). Kräver viewport-fit=cover (app/layout.tsx har det) — utan den är alla env() noll.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AVSTAND, FARG, KOLUMN, RADIE, TRAFFYTA, medSafeBotten, overgang } from '@/lib/design/tokens';
import { underKartHuvud } from '@/components/design/KartHuvud';
import {
  arkDragHojd, arkForskjutning, arkHojder, nastaGreppLage, valjArkLage, type ArkLage,
} from '@/lib/egenkontrollArk';

/** Draget under så här många px räknas som ett tryck. */
const TRYCK_PX = 6;

export type RundArkProps = {
  lage: ArkLage;
  onLage: (l: ArkLage) => void;
  /** Dockan: raden och brickorna. Alltid synlig. */
  topp: ReactNode;
  /** Rundan-innehållet. Syns i hel; ej nåbart (inert) i dock. */
  children: ReactNode;
  /** Mätpunkt för kartans padding: ett nolldimensionellt element vars överkant är arkets synliga överkant. */
  malRef: RefObject<HTMLDivElement>;
  /** Anropas när arkets synliga höjd ändrats (läge eller dockens höjd) — sidan mäter om kartans padding. */
  onMatt?: (nyckel: string) => void;
  /** Anropas när ett drag börjar/slutar (sidan döljer sidoknapparna medan arket rör sig). */
  onDrar?: (drar: boolean) => void;
  ariaLabel?: string;
};

export default function RundArk({ lage, onLage, topp, children, malRef, onMatt, onDrar, ariaLabel = 'Rundan' }: RundArkProps) {
  const rotRef = useRef<HTMLElement | null>(null);
  const toppRef = useRef<HTMLDivElement | null>(null);
  const innehallRef = useRef<HTMLDivElement | null>(null);
  const inreRef = useRef<HTMLDivElement | null>(null);
  const [mat, setMat] = useState({ fonster: 0, hel: 0, dock: 0, inre: 0 });
  const [dy, setDy] = useState<number | null>(null);
  const drag = useRef<{ y0: number; dy: number; flyttat: boolean } | null>(null);
  const slukKlick = useRef(false);

  const matOm = useCallback(() => {
    const fonster = typeof window !== 'undefined' ? window.innerHeight : 0;
    const hel = rotRef.current?.offsetHeight ?? 0;
    const dock = toppRef.current?.offsetHeight ?? 0;
    // Innehållets egen höjd: den inre omslagsdivens (som inte sträcks) plus ytterdivens padding (hemindikatorns luft ligger där).
    const cs = innehallRef.current && typeof getComputedStyle === 'function' ? getComputedStyle(innehallRef.current) : null;
    const pad = cs ? (Number.parseFloat(cs.paddingTop) || 0) + (Number.parseFloat(cs.paddingBottom) || 0) : 0;
    const inre = (inreRef.current?.offsetHeight ?? 0) + pad;
    setMat((g) => (g.fonster === fonster && g.hel === hel && g.dock === dock && g.inre === inre ? g : { fonster, hel, dock, inre }));
  }, []);

  useLayoutEffect(() => {
    matOm();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(matOm) : null;
    if (ro) {
      if (rotRef.current) ro.observe(rotRef.current);
      if (toppRef.current) ro.observe(toppRef.current);
      if (inreRef.current) ro.observe(inreRef.current);
    }
    window.addEventListener('resize', matOm);
    return () => { ro?.disconnect(); window.removeEventListener('resize', matOm); };
  }, [matOm]);

  // Innehållet under brickorna är inte nåbart (varken med tryck, tab eller skärmläsare) när det ligger utanför skärmen.
  useEffect(() => {
    const el = innehallRef.current;
    if (!el) return;
    el.toggleAttribute('inert', lage === 'dock');
  }, [lage]);

  const h = arkHojder({ fonsterHojd: mat.fonster, dockPx: mat.dock, toppReservPx: Math.max(0, mat.fonster - mat.hel), innehallPx: mat.inre });
  const synlig = dy === null ? h[lage] : arkDragHojd(lage, dy, h);
  const forskjutning = h.max - synlig;

  // Sidan mäter om kartans padding när det SLUTLIGA läget ändrats (inte under draget).
  const nyckel = `${lage}:${h.dock}:${h.hel}`;
  useEffect(() => { onMatt?.(nyckel); }, [nyckel, onMatt]);

  const start = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { y0: e.clientY, dy: 0, flyttat: false };
  };
  const ror = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    d.dy = e.clientY - d.y0;
    if (!d.flyttat && Math.abs(d.dy) > TRYCK_PX) { d.flyttat = true; onDrar?.(true); }
    if (d.flyttat) setDy(d.dy);
  };
  const slut = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.flyttat) return;
    slukKlick.current = true;
    setTimeout(() => { slukKlick.current = false; }, 0);
    setDy(null);
    onDrar?.(false);
    onLage(valjArkLage(lage, d.dy, h));
  };
  const klick = () => {
    if (slukKlick.current) { slukKlick.current = false; return; }
    onLage(nastaGreppLage(lage));
  };

  return (
    <>
      {/* Mätpunkten är 1 px hög (useKartPadding räknar en dock utan höjd som "inte ritad än"): dess överkant = arkets synliga överkant. */}
      <div ref={malRef} aria-hidden="true" data-testid="ark-mal" style={{ position: 'fixed', left: 0, width: 1, height: 1, bottom: `${Math.round(synlig) - 1}px`, pointerEvents: 'none' }} />
      <section
        ref={rotRef}
        aria-label={ariaLabel}
        data-testid="rund-ark"
        data-lage={lage}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, marginLeft: 'auto', marginRight: 'auto', width: '100%', maxWidth: KOLUMN.ark,
          height: `calc(100dvh - ${underKartHuvud(AVSTAND.s)})`, zIndex: 10, boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
          background: FARG.kort, color: FARG.text, fontFamily: 'inherit', borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`,
          transform: `translateY(${Math.round(forskjutning)}px)`, transition: dy === null ? overgang('transform') : 'none', willChange: 'transform',
        }}
      >
        <div ref={toppRef} style={{ flexShrink: 0, paddingBottom: medSafeBotten(AVSTAND.m) }}>
          {/* Greppet. Synligt streck + en träffyta på 44 px som sticker upp över arkets överkant, så arket inte blir 44 px högre. */}
          <div style={{ position: 'relative', height: AVSTAND.xl + AVSTAND.xs, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button
              type="button"
              aria-label={lage === 'dock' ? 'Visa mer av rundan' : 'Visa bara brickorna'}
              aria-expanded={lage !== 'dock'}
              data-testid="ark-grepp"
              onClick={klick}
              onPointerDown={start}
              onPointerMove={ror}
              onPointerUp={slut}
              onPointerCancel={slut}
              style={{
                position: 'absolute', left: 0, right: 0, top: -AVSTAND.l, height: TRAFFYTA.min, padding: 0, border: 'none',
                background: 'none', touchAction: 'none', cursor: 'grab', WebkitTapHighlightColor: 'transparent',
              }}
            />
            <span aria-hidden="true" style={{ width: AVSTAND.xxl, height: AVSTAND.xs, borderRadius: RADIE.stapel, background: FARG.text3, pointerEvents: 'none' }} />
          </div>
          {topp}
        </div>
        <div
          ref={innehallRef}
          aria-hidden={lage === 'dock'}
          data-testid="ark-innehall"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: `0 ${AVSTAND.l}px ${medSafeBotten(AVSTAND.xl)}` }}
        >
          {/* Omslaget mäts: det sträcks inte, så dess höjd är innehållets egen. flow-root håller första barnets marginal inne i höjden. */}
          <div ref={inreRef} data-testid="ark-innehall-inre" style={{ display: 'flow-root' }}>{children}</div>
        </div>
      </section>
    </>
  );
}
