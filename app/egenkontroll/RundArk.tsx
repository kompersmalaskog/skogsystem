'use client';

// RUNDARKET: ett ark som ligger NEDERST på kartan och kan dras upp och ned. Dockan (raden och brickorna) är arkets mellanläge; Rundan-innehållet
// (kommentaren, observationerna, stubbehandlingen, avslutet) ligger under brickorna och syns i hel.
//
// AVSTEG 4/7 FRÅN PLANERINGSVYN: ARKET STÄNGS ALDRIG — DET HAR TRE LÄGEN MED ETT JOBB VARDERA: SÄNKT (GÅ), DOCK (SVARA) OCH HEL (RUNDAN).
// Planeringens ark (InfoRam) har halv och hel höjd och stängs genom att dras ned. Här stängs arket aldrig: greppet står kvar även i sänkt, och
// brickorna ska alltid gå att nå med ett tryck. Sänkt = bara greppet (kartan får nästan hela skärmen), dock = raden och brickorna, hel =
// dockan + Rundan-innehållet. Regeln för ett läge (lib/egenkontrollArk.ts, LAGE_JOBB): det får finnas bara om dess jobb går att säga med ETT
// ord — ett fjärde läge som inte går att beskriva byggs inte. Inget halvt mellanläge: en bestämd andel av skärmen gav kartan 126 px (oanvändbart).
// Hel följer i stället sitt innehåll: kort innehåll lämnar kartan synlig ovanför, långt innehåll tar skärmen minus huvudet och scrollar.
// Arket är alltid så högt som max och förskjuts nedåt med translateY, så ett läge är bara ett tal (hur många px som syns,
// lib/egenkontrollArk.ts) och kartans padding kan räknas exakt. Det dras i greppet (44 px hög träffyta) och bara där: brickorna och
// innehållet har egna tryck. Tryck på greppet går vidare ett läge varje gång (sänkt → dock → hel → sänkt); drag fungerar åt båda hållen.
// Arket ligger nedtill på alla bredder (max KOLUMN.ark) — aldrig en panel från höger: den som går rundan har tummen nere.
//
// INGET TRYCKBART FÅR FLYTTA SIG UNDER FINGRET. Arket är bottenförankrat, så det som ligger under något som växer ligger kvar — bara det som
// är ovanför flyttar sig. Men layouten ändras direkt medan translateY måste mätas och animeras efter: därför hoppade brickorna +61 px (och
// radens knappar 61 px) när raden dök upp (uppmätt i Chromium 390 × 760). Nu ändras transformen i SAMMA bildruta som layouten (mätningen sker i
// en layout-effekt efter varje rendering, före målning) och animationen körs BARA vid lägesbyte och när ett drag släpps. En kommentar som växer
// ovanför knapparna flyttar alltså bara texten.
//
// SAFE-AREA: arkets nederkant ligger vid skärmens nederkant (bottom 0) och dockans innehåll slutar med `medSafeBotten(AVSTAND.m)` =
// max(12 px, 8 px + env(safe-area-inset-bottom)), så den understa brickraden ligger alltid OVANFÖR hemindikatorn. Höjden som mäts (`toppRef`)
// inkluderar den paddingen, så dockan sitter exakt rätt utan att något räknar med ett antaget mått. Hel slutar under huvudet, som ligger på
// `env(safe-area-inset-top)` + 8 px (underKartHuvud). Kräver viewport-fit=cover (app/layout.tsx har det) — utan den är alla env() noll.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AVSTAND, FARG, KOLUMN, RADIE, TRAFFYTA, TYP, medSafeBotten, overgang } from '@/lib/design/tokens';
import { underKartHuvud } from '@/components/design/KartHuvud';
import {
  arkDragHojd, arkForskjutning, arkHojder, nastaGreppLage, radFaltMax, valjArkLage, type ArkLage,
} from '@/lib/egenkontrollArk';
import { RAD_MAX_DVH } from '@/lib/egenkontrollBricka';

/** Draget under så här många px räknas som ett tryck. */
const TRYCK_PX = 6;

/** Så länge en lägesanimation får pågå innan ett höjdbyte på grund av innehållet åter är omedelbart (reserv om transitionend uteblir). */
const ANIMERING_MS = 450;

/** Radens innehållsfält är aldrig lägre än två rader text, hur liten skärmen än är (kartan går före på en riktigt liten skärm, men inte under det). */
const RAD_FALT_GOLV_PX = Math.ceil(TYP.meta.fontSize * TYP.meta.lineHeight * 2);

export type RundArkProps = {
  lage: ArkLage;
  onLage: (l: ArkLage) => void;
  /** Dockan: raden och brickorna. Syns i dock och hel; ej nåbar (inert) i sänkt. */
  topp: ReactNode;
  /** Rundan-innehållet. Syns i hel; ej nåbart (inert) i sänkt och dock. */
  children: ReactNode;
  /** Mätpunkt för kartans padding: ett nolldimensionellt element vars överkant är arkets synliga överkant. */
  malRef: RefObject<HTMLDivElement>;
  /** Anropas när arkets synliga höjd ändrats (läge eller höjd) — sidan mäter om kartans padding. */
  onMatt?: (nyckel: string) => void;
  /** Anropas när ett drag börjar/slutar (sidan döljer sidoknapparna medan arket rör sig). */
  onDrar?: (drar: boolean) => void;
  ariaLabel?: string;
};

export default function RundArk({ lage, onLage, topp, children, malRef, onMatt, onDrar, ariaLabel = 'Rundan' }: RundArkProps) {
  const rotRef = useRef<HTMLElement | null>(null);
  const toppRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const innehallRef = useRef<HTMLDivElement | null>(null);
  const inreRef = useRef<HTMLDivElement | null>(null);
  const [mat, setMat] = useState({ fonster: 0, hel: 0, dock: 0, sankt: 0, falt: 0, inre: 0 });
  // Animationen körs bara vid lägesbyte och när ett drag släpps. `animera` sätts under renderingen (samma commit som den nya transformen) och
  // släpps när transitionen är klar (eller efter ANIMERING_MS). Ett höjdbyte av annan orsak (en kommentar som växer) är därmed omedelbart.
  const forraLage = useRef(lage);
  const animera = useRef(false);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (forraLage.current !== lage) { forraLage.current = lage; animera.current = true; }
  const [dy, setDy] = useState<number | null>(null);
  const drag = useRef<{ y0: number; dy: number; flyttat: boolean } | null>(null);
  const slukKlick = useRef(false);

  const matOm = useCallback(() => {
    const fonster = typeof window !== 'undefined' ? window.innerHeight : 0;
    const hel = rotRef.current?.offsetHeight ?? 0;
    const dock = toppRef.current?.offsetHeight ?? 0;
    // Sänkt = greppet + hemindikatorns luft: toppen minus dockinnehållet. Fältet = radens innehållsfält (räknas bort för att få dockans BAS).
    const sankt = Math.max(0, dock - (dockRef.current?.offsetHeight ?? 0));
    const falt = toppRef.current
      ? Array.from(toppRef.current.querySelectorAll<HTMLElement>('[data-dock-falt]')).reduce((sum, e) => sum + e.offsetHeight, 0)
      : 0;
    // Innehållets egen höjd: den inre omslagsdivens (som inte sträcks) plus ytterdivens padding (hemindikatorns luft ligger där).
    const cs = innehallRef.current && typeof getComputedStyle === 'function' ? getComputedStyle(innehallRef.current) : null;
    const pad = cs ? (Number.parseFloat(cs.paddingTop) || 0) + (Number.parseFloat(cs.paddingBottom) || 0) : 0;
    const inre = (inreRef.current?.offsetHeight ?? 0) + pad;
    setMat((g) => (g.fonster === fonster && g.hel === hel && g.dock === dock && g.sankt === sankt && g.falt === falt && g.inre === inre ? g : { fonster, hel, dock, sankt, falt, inre }));
  }, []);

  // Mät efter VARJE rendering, före målning: ändras dockans höjd av innehållet (raden fick en kommentar) räknas transformen om i samma bildruta
  // som layouten, utan animation — så ingenting som ligger under det som växte hinner flytta sig. (setMat bailar ut när inget ändrats.)
  useLayoutEffect(() => { matOm(); });

  useLayoutEffect(() => {
    matOm();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(matOm) : null;
    if (ro) {
      if (rotRef.current) ro.observe(rotRef.current);
      if (toppRef.current) ro.observe(toppRef.current);
      if (inreRef.current) ro.observe(inreRef.current);
    }
    if (ro && dockRef.current) ro.observe(dockRef.current);
    window.addEventListener('resize', matOm);
    return () => { ro?.disconnect(); window.removeEventListener('resize', matOm); };
  }, [matOm]);

  // Släpp animeringen när den är klar (transitionend), annars efter ANIMERING_MS.
  const planeraSlappAvAnimering = useCallback(() => {
    if (animTimer.current) clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => { animera.current = false; }, ANIMERING_MS);
  }, []);
  useEffect(() => { planeraSlappAvAnimering(); return () => { if (animTimer.current) clearTimeout(animTimer.current); }; }, [lage, planeraSlappAvAnimering]);

  // Dockan göms först när arket hunnit glida ned till sänkt (annars försvinner den mitt i rörelsen), och visas igen direkt när man lämnar sänkt.
  const [dockDold, setDockDold] = useState(lage === 'sankt');
  useEffect(() => {
    if (lage !== 'sankt') { setDockDold(false); return undefined; }
    const t = setTimeout(() => setDockDold(true), ANIMERING_MS / 2);
    return () => clearTimeout(t);
  }, [lage]);

  // Det som ligger utanför skärmen är inte nåbart (varken med tryck, tab eller skärmläsare): innehållet under brickorna utom i hel, dockan i sänkt.
  useEffect(() => {
    innehallRef.current?.toggleAttribute('inert', lage !== 'hel');
    dockRef.current?.toggleAttribute('inert', lage === 'sankt');
  }, [lage]);

  const h = arkHojder({ fonsterHojd: mat.fonster, sanktPx: mat.sankt, dockPx: mat.dock, toppReservPx: Math.max(0, mat.fonster - mat.hel), innehallPx: mat.inre });
  const synlig = dy === null ? h[lage] : arkDragHojd(lage, dy, h);
  const forskjutning = h.max - synlig;
  // Radens innehållsfält får växa tills kartan har KARTA_MIN_PX kvar (bas = dockan utan fältet), aldrig över RAD_MAX_DVH och aldrig under två rader.
  const radMax = radFaltMax({ max: h.max, bas: mat.dock - mat.falt, golv: RAD_FALT_GOLV_PX, tak: Math.round((mat.fonster * RAD_MAX_DVH) / 100) });

  // Sidan mäter om kartans padding när det SLUTLIGA läget ändrats (inte under draget).
  const nyckel = `${lage}:${h.sankt}:${h.dock}:${h.hel}`;
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
    animera.current = true;            // släppet landar med animation, också när läget blir detsamma
    planeraSlappAvAnimering();
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
          transform: `translateY(${Math.round(forskjutning)}px)`, transition: dy === null && animera.current ? overgang('transform') : 'none', willChange: 'transform',
          ['--rad-max' as string]: `${radMax}px`,
        } as React.CSSProperties}
        onTransitionEnd={(e) => { if (e.target === e.currentTarget && e.propertyName === 'transform') animera.current = false; }}
      >
        <div ref={toppRef} style={{ flexShrink: 0, paddingBottom: medSafeBotten(AVSTAND.m) }}>
          {/* Greppet. Synligt streck + en träffyta på 44 px som sticker upp över arkets överkant, så arket inte blir 44 px högre. */}
          <div style={{ position: 'relative', height: AVSTAND.xl + AVSTAND.xs, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button
              type="button"
              aria-label={lage === 'sankt' ? 'Visa brickorna' : lage === 'dock' ? 'Visa mer av rundan' : 'Sänk arket'}
              aria-expanded={lage !== 'sankt'}
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
          {/* I sänkt syns bara greppet och hemindikatorns luft: dockinnehållet göms (visibility, när arket hunnit glida ned, och är synligt igen
              direkt när man lämnar sänkt eller drar) — annars tittar dockans första rad fram under greppet. */}
          <div
            ref={dockRef}
            data-testid="ark-dock"
            aria-hidden={lage === 'sankt'}
            style={{ visibility: dockDold && dy === null ? 'hidden' : 'visible' }}
          >{topp}</div>
        </div>
        <div
          ref={innehallRef}
          aria-hidden={lage !== 'hel'}
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
