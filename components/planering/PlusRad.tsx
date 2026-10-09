'use client';

// PLUS-DOCKAN — delad komponent för körvyn och planeringen. Plusknappen expanderar åt vänster till en mörk, rundad docka nere till
// höger (inte full bredd, kartan ovanför är fri): sex runda symbolknappar à 56 px i symbolens riktiga färg med namnet under, ett
// avdelarstreck, "Alla" och × (plussets stängning). Dockan fylls bara med symboler — fasta först, sedan mest använda (regeln bor i
// lib/plusRad); Högstubbe/Evighetsträd finns i pillen. "Alla" öppnar arket (PlusArk): Symboler · Ytor · Spårning · Lager.
//
//   håll fingret på en symbol i dockan → "Fast i dockan" (automatisk) / "Lossa" (fast)
//
// Komponenten är ren presentation + håll-fingret-menyn; vad ett tryck GÖR (placera, växla lager, öppna ytkort) avgör sidan.
// Via designtokens. Dockan har ingen bakgrundsskugga över kartan — den stängs med ×.

import React, { useEffect, useRef, useState } from 'react';
import { AVSTAND, FARG, RADIE, RORELSE, TYP } from '@/lib/design/tokens';
import { skapaLangtryck } from '@/lib/langtryck';
import { MAX_FASTA } from '@/lib/plusRad';
import type { FlikId } from '@/lib/plusArk';
import { PlusArk, type ArkData, type PlusPostVy } from './PlusArk';

export type { ArkData, PlusPostVy, SymbolKategori, YtaRad, LagerRad, LagerGrupp, SparningData } from './PlusArk';

export interface HallSvar { ok: boolean; text: string }

export const DOCK_KNAPP_PX = 56;
const DOCK_RADIE_PX = AVSTAND.xl + AVSTAND.s;          // 32 — en mjuk pill
const DOCK_BRED_MIN_PX = 760;                            // under det: två rader (4 + 4) i stället för en

/** true när fönstret är minst `px` brett (matchMedia; true på servern så första renderingen är den breda). */
function useMinBredd(px: number): boolean {
  const [bred, setBred] = useState(true);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(min-width: ${px}px)`);
    const upd = () => setBred(mq.matches);
    upd();
    mq.addEventListener?.('change', upd);
    return () => mq.removeEventListener?.('change', upd);
  }, [px]);
  return bred;
}

const Nal = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill={FARG.text} style={{ position: 'absolute', top: -AVSTAND.xs, right: -AVSTAND.xs, filter: `drop-shadow(0 0 2px ${FARG.bg})` }}>
    <path d="M14 3l7 7-3 1-3.5 3.5.5 4.5-1.5 1.5-4-4-5.5 5.5-1-1L9.5 14l-4-4L7 8.5 11.5 9 15 5.5z" />
  </svg>
);

const AllaIkon = ({ px }: { px: number }) => (
  <svg aria-hidden="true" width={px} height={px} viewBox="0 0 24 24" fill={FARG.text}>
    <rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" />
    <rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" />
  </svg>
);

const StangIkon = () => (
  <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={FARG.bg} strokeWidth="2.4" strokeLinecap="round">
    <path d="M6 6 L18 18" /><path d="M18 6 L6 18" />
  </svg>
);

export function PlusRad({ poster, ark, startFlik, onPost, onFastna, onLossa, onSparaDocka, onStang }: {
  poster: PlusPostVy[];
  ark: ArkData;
  /** öppna direkt i arket på den här fliken (t.ex. från objektinfons Lager-rad) i stället för att börja i dockan */
  startFlik?: FlikId | null;
  onPost: (nyckel: string) => void;
  onFastna: (nyckel: string) => HallSvar;
  onLossa: (nyckel: string) => void;
  /** Klar i Redigera: dockans nya platser (symbolnycklar, i ordning) */
  onSparaDocka: (nycklar: string[]) => void;
  onStang: () => void;
}) {
  const [visaAlla, setVisaAlla] = useState(!!startFlik);
  const [flik, setFlik] = useState<FlikId>(startFlik ?? 'symboler');
  const [hall, setHall] = useState<{ nyckel: string; etikett: string; fast: boolean; svar?: string } | null>(null);
  const [inne, setInne] = useState(false);
  const bred = useMinBredd(DOCK_BRED_MIN_PX);
  const lt = useRef(skapaLangtryck()).current;

  // Mjuk ut-animation ur plusknappen: dockan startar liten i nedre högra hörnet (där plusset sitter) och växer åt vänster.
  useEffect(() => {
    const minskad = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (minskad) { setInne(true); return; }
    const id = requestAnimationFrame(() => setInne(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const hallProps = (p: PlusPostVy, tryck: () => void) => (p.fastbar === false
    ? { onClick: tryck }
    : {
        onPointerDown: (e: React.PointerEvent) => lt.start(() => setHall({ nyckel: p.nyckel, etikett: p.etikett, fast: p.fast }), e.clientX, e.clientY),
        onPointerMove: (e: React.PointerEvent) => lt.rorelse(e.clientX, e.clientY),
        onPointerUp: lt.stopp,
        onPointerLeave: lt.stopp,
        onPointerCancel: lt.stopp,
        onContextMenu: (e: React.SyntheticEvent) => e.preventDefault(),
        onClick: () => { if (lt.slukKlick()) return; tryck(); },
      });
  const stangHall = () => setHall(null);
  const valHall = (slag: 'fast' | 'lossa') => {
    if (!hall || hall.svar) return;
    let svar: HallSvar;
    if (slag === 'fast') svar = onFastna(hall.nyckel);
    else { onLossa(hall.nyckel); svar = { ok: true, text: 'Lossad' }; }
    setHall({ ...hall, svar: svar.text });
    setTimeout(() => setHall(null), svar.ok ? 1200 : 2400);
  };

  const hallKort = hall && (
    <>
      <div onClick={stangHall} data-testid="plus-hall-bakgrund" style={{ position: 'fixed', inset: 0, zIndex: 655 }} />
      <div
        role="dialog"
        aria-label={hall.etikett}
        data-testid="plus-hall"
        style={{
          position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 660, width: `min(420px, calc(100vw - ${2 * AVSTAND.l}px))`, boxSizing: 'border-box',
          bottom: `calc(${AVSTAND.xl}px + env(safe-area-inset-bottom, 0px))`, padding: AVSTAND.l, borderRadius: RADIE.sheet, background: FARG.upphojt,
          border: `1px solid ${FARG.linje}`, color: FARG.text, fontFamily: 'inherit',
        }}
      >
        {hall.svar ? (
          <div data-testid="plus-hall-svar" style={{ minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', ...TYP.listtitel }}>{hall.svar}</div>
        ) : (
          <>
            <div style={{ ...TYP.listtitel, marginBottom: AVSTAND.m, textAlign: 'center' }}>{hall.etikett}</div>
            <div style={{ display: 'flex', gap: AVSTAND.s }}>
              <button type="button" onClick={stangHall} data-testid="plus-hall-avbryt"
                style={{ flex: 1, minHeight: 56, border: 'none', borderRadius: RADIE.knapp, background: FARG.fyllning, color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', ...TYP.listtitel }}>Avbryt</button>
              <button type="button" onClick={() => valHall(hall.fast ? 'lossa' : 'fast')} data-testid={hall.fast ? 'plus-hall-lossa' : 'plus-hall-fast'}
                style={{ flex: 1, minHeight: 56, border: 'none', borderRadius: RADIE.knapp, background: FARG.text, color: FARG.bg, fontFamily: 'inherit', cursor: 'pointer', ...TYP.listtitel }}>
                {hall.fast ? 'Lossa' : 'Fast i dockan'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );

  // ── Arket (Alla) ──
  if (visaAlla) {
    return (
      <PlusArk
        data={ark}
        flik={flik}
        onFlik={setFlik}
        bred={bred}
        dockNu={poster}
        onPost={onPost}
        onSparaDocka={onSparaDocka}
        onStang={onStang}
      />
    );
  }

  // ── Dockan ──
  const symbolKnapp = (p: PlusPostVy) => (
    <button
      key={p.nyckel}
      type="button"
      data-testid={`plus-post-${p.nyckel}`}
      data-fast={p.fast ? '1' : '0'}
      aria-label={p.etikett}
      className="press-scale"
      {...hallProps(p, () => onPost(p.nyckel))}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.xs, width: bred ? 84 : 80, padding: 0, border: 'none', background: 'transparent',
        color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation', WebkitTouchCallout: 'none', userSelect: 'none',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: DOCK_KNAPP_PX, height: DOCK_KNAPP_PX, borderRadius: RADIE.cirkel,
          background: p.dockFarg ?? FARG.upphojt, boxShadow: `0 0 0 ${AVSTAND.xs / 2}px ${p.dockRing ?? FARG.fyllning}`, boxSizing: 'border-box',
        }}
      >
        {p.dockGlyf}
        {p.fast && <Nal />}
      </span>
      <span style={{ ...TYP.meta, fontWeight: 600, textAlign: 'center', lineHeight: 1.15, maxWidth: '100%' }}>{p.etikett}</span>
    </button>
  );
  const allaKnapp = (
    <button
      type="button"
      data-testid="plus-alla"
      aria-label="Alla"
      className="press-scale"
      onClick={() => setVisaAlla(true)}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.xs, width: bred ? 72 : 80, padding: 0, border: 'none', background: 'transparent', color: FARG.text2, fontFamily: 'inherit', cursor: 'pointer' }}
    >
      <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: DOCK_KNAPP_PX, height: DOCK_KNAPP_PX, borderRadius: RADIE.cirkel, background: FARG.upphojt }}>
        <AllaIkon px={AVSTAND.xl} />
      </span>
      <span style={{ ...TYP.meta, fontWeight: 600 }}>Alla</span>
    </button>
  );
  const stangKnapp = (
    <button
      type="button"
      data-testid="plus-stang"
      aria-label="Stäng meny"
      className="press-scale"
      onClick={onStang}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.xs, width: bred ? 64 : 80, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
    >
      <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: DOCK_KNAPP_PX, height: DOCK_KNAPP_PX, borderRadius: RADIE.cirkel, background: FARG.text }}>
        <StangIkon />
      </span>
    </button>
  );
  const avdelare = <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', margin: `0 ${AVSTAND.xs}px`, background: FARG.fyllning }} />;

  return (
    <>
      <div
        role="dialog"
        aria-label="Plus"
        data-testid="plus-rad"
        style={{
          position: 'fixed', right: AVSTAND.s, bottom: `calc(${AVSTAND.s}px + env(safe-area-inset-bottom, 0px))`, zIndex: 650, boxSizing: 'border-box',
          maxWidth: `calc(100vw - ${2 * AVSTAND.s}px)`, padding: `${AVSTAND.m}px ${AVSTAND.m}px ${AVSTAND.m - AVSTAND.xs}px ${AVSTAND.l}px`,
          background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: DOCK_RADIE_PX, color: FARG.text, fontFamily: 'inherit',
          transformOrigin: 'right bottom', transform: inne ? 'scale(1)' : 'scale(0.3)', opacity: inne ? 1 : 0,
          transition: `transform ${RORELSE.byte}ms ${RORELSE.kurva}, opacity ${RORELSE.byte}ms ${RORELSE.kurva}`,
          ...(bred
            ? { display: 'flex', alignItems: 'flex-start', gap: AVSTAND.xs }
            : { display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: `${AVSTAND.m}px ${AVSTAND.xs}px`, justifyItems: 'center' }),
        }}
      >
        {poster.slice(0, MAX_FASTA).map(symbolKnapp)}
        {bred && avdelare}
        {allaKnapp}
        {stangKnapp}
      </div>
      {hallKort}
    </>
  );
}
