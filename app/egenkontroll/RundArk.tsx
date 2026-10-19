'use client';

// RUNDARKET: ett ark som ligger NEDERST på kartan och kan dras upp. Dockan (brickorna) är arkets understa läge; Rundan-innehållet
// (listan, kommentaren, observationerna, stubbehandlingen, avslutet) ligger under brickorna och syns när arket dras upp.
//
// AVSTEG 4/7 FRÅN PLANERINGSVYN: ARKET HAR TRE LÄGEN I STÄLLET FÖR TVÅ.
// Planeringens ark (InfoRam) har halv och hel höjd, och stängs genom att dras ned. Här stängs arket aldrig — dockan ÄR det understa läget,
// och brickorna ska alltid finnas kvar — så lägena är tre: dock (bara brickorna), halv (innehållet under dem) och hel (nästan hela
// skärmen, huvudet synligt). Arket är alltid så högt som hel och förskjuts nedåt med translateY, så ett läge är bara ett tal (hur många px som
// syns, lib/egenkontrollArk.ts) och kartans padding kan räknas exakt. Det dras i greppet (44 px hög träffyta) och bara där: brickorna och
// innehållet har egna tryck. Tryck på greppet växlar dock ↔ halv. Arket ligger nedtill på alla bredder (max KOLUMN.ark) — aldrig en panel från
// höger: den som går rundan har tummen nere, och en panel på sidan täcker kartan åt ena hållet.

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
  /** Rundan-innehållet. Syns i halv och hel; ej nåbart (inert) i dock. */
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
  const [mat, setMat] = useState({ fonster: 0, hel: 0, dock: 0 });
  const [dy, setDy] = useState<number | null>(null);
  const drag = useRef<{ y0: number; dy: number; flyttat: boolean } | null>(null);
  const slukKlick = useRef(false);

  const matOm = useCallback(() => {
    const fonster = typeof window !== 'undefined' ? window.innerHeight : 0;
    const hel = rotRef.current?.offsetHeight ?? 0;
    const dock = toppRef.current?.offsetHeight ?? 0;
    setMat((g) => (g.fonster === fonster && g.hel === hel && g.dock === dock ? g : { fonster, hel, dock }));
  }, []);

  useLayoutEffect(() => {
    matOm();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(matOm) : null;
    if (ro) {
      if (rotRef.current) ro.observe(rotRef.current);
      if (toppRef.current) ro.observe(toppRef.current);
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

  const h = arkHojder({ fonsterHojd: mat.fonster, dockPx: mat.dock, toppReservPx: Math.max(0, mat.fonster - mat.hel) });
  const synlig = dy === null ? h[lage] : arkDragHojd(lage, dy, h);
  const forskjutning = h.hel - synlig;

  // Sidan mäter om kartans padding när det SLUTLIGA läget ändrats (inte under draget).
  const nyckel = `${lage}:${h.dock}:${h.halv}:${h.hel}`;
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
          {children}
        </div>
      </section>
    </>
  );
}
