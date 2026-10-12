'use client';

// PLUS-DOCKAN — delad komponent för körvyn och planeringen. Plusknappen expanderar åt vänster till en mörk, rundad docka nere till
// höger (inte full bredd, kartan ovanför är fri): sex runda symbolknappar à 56 px i symbolens riktiga färg med namnet under, ett
// avdelarstreck, "Alla" och × (plussets stängning). Dockan fylls bara med symboler — fasta först, sedan mest använda (regeln bor i
// lib/plusRad); Högstubbe/Evighetsträd finns i pillen och mätverktygen finns i Alla. "Alla" öppnar alla symboler, Rita och mät, och alla
// lager (växlar) i ett ark.
//
//   håll fingret på en symbol → "Fast i dockan" (automatisk) / "Lossa" (fast)
//
// Komponenten är ren presentation + håll-fingret-menyn; vad ett tryck GÖR (placera, växla lager, starta mätning) avgör sidan.
// Via designtokens. Dockan har ingen bakgrundsskugga över kartan — den stängs med ×.

import React, { useEffect, useRef, useState } from 'react';
import { AVSTAND, FARG, RADIE, RORELSE, TNUM, TYP, medSafeBotten } from '@/lib/design/tokens';
import { skapaLangtryck } from '@/lib/langtryck';
import { MAX_FASTA } from '@/lib/plusRad';

export interface PlusPostVy {
  nyckel: string;
  etikett: string;
  /** ikon i Alla-arket */
  ikon: React.ReactNode;
  fast: boolean;
  /** lager: På/Av (visas som ord under namnet, färg bär aldrig ensam) */
  pa?: boolean;
  /** symbol: går att fästa i dockan (håll fingret). Lager, Rita och mät går inte. */
  fastbar?: boolean;
  /** dockan: cirkelns färg = symbolens riktiga färg på kartan, ringen runt den, och glyfen i mitten */
  dockFarg?: string;
  dockRing?: string;
  dockGlyf?: React.ReactNode;
}

export interface AllaSektion {
  id: string;
  rubrik: string;
  /** 'ruta' = tryckbara rutor i rutnät, 'vaxel' = rader med På/Av-reglage */
  slag: 'ruta' | 'vaxel';
  poster: PlusPostVy[];
}

export interface HallSvar { ok: boolean; text: string }

export const DOCK_KNAPP_PX = 56;
const DOCK_RADIE_PX = AVSTAND.xl + AVSTAND.s;          // 32 — en mjuk pill
const DOCK_BRED_MIN_PX = 760;                            // under det: två rader (4 + 4) i stället för en
const ALLA_RUTA_PX = 96;
const BACKDROP_GUARD_MS = 450;                           // Alla-arket: ett fingerlyft precis efter öppning får inte stänga det

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

export function PlusRad({ poster, alla, smal, onPost, onFastna, onLossa, onFlerVal, onStang }: {
  poster: PlusPostVy[];
  alla: AllaSektion[];
  smal: boolean;
  onPost: (nyckel: string) => void;
  onFastna: (nyckel: string) => HallSvar;
  onLossa: (nyckel: string) => void;
  onFlerVal: () => void;
  onStang: () => void;
}) {
  const [visaAlla, setVisaAlla] = useState(false);
  const [hall, setHall] = useState<{ nyckel: string; etikett: string; fast: boolean; svar?: string } | null>(null);
  const [inne, setInne] = useState(false);
  const bred = useMinBredd(DOCK_BRED_MIN_PX);
  const lt = useRef(skapaLangtryck()).current;
  const monterad = useRef(Date.now());

  // Mjuk ut-animation ur plusknappen: dockan startar liten i nedre högra hörnet (där plusset sitter) och växer åt vänster.
  useEffect(() => {
    const minskad = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (minskad) { setInne(true); return; }
    const id = requestAnimationFrame(() => setInne(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const stangBakgrund = () => { if (Date.now() - monterad.current < BACKDROP_GUARD_MS) return; onStang(); };
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

  const ark: React.CSSProperties = {
    position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 650, boxSizing: 'border-box', background: FARG.kort, color: FARG.text, fontFamily: 'inherit',
    borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, paddingBottom: medSafeBotten(AVSTAND.l),
  };
  const grepp = (
    <button type="button" aria-label="Stäng" data-testid="plus-alla-stang" onClick={onStang}
      style={{ display: 'flex', alignSelf: 'center', margin: '0 auto', width: 96, height: AVSTAND.xl, border: 'none', background: 'transparent', cursor: 'pointer', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ width: 40, height: 4, borderRadius: 4, background: FARG.text3 }} />
    </button>
  );

  // En ruta i Alla-arket
  const ruta = (p: PlusPostVy, hojd: number, testid: string) => (
    <button
      key={p.nyckel}
      type="button"
      data-testid={testid}
      data-fast={p.fast ? '1' : '0'}
      data-fastbar={p.fastbar === false ? '0' : '1'}
      data-pa={p.pa === undefined ? undefined : p.pa ? '1' : '0'}
      className="press-scale"
      {...hallProps(p, () => onPost(p.nyckel))}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: smal ? AVSTAND.xs : AVSTAND.s, minHeight: hojd,
        padding: AVSTAND.s, border: 'none', borderRadius: RADIE.knapp, background: FARG.upphojt, color: FARG.text, fontFamily: 'inherit', cursor: 'pointer',
        touchAction: 'manipulation', WebkitTouchCallout: 'none', userSelect: 'none', minWidth: 0,
      }}
    >
      {p.fast && <span style={{ position: 'absolute', top: AVSTAND.s, right: AVSTAND.s, width: 16, height: 16 }}><Nal /></span>}
      <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: smal ? AVSTAND.xl + AVSTAND.xs : AVSTAND.xxl + AVSTAND.s }}>{p.ikon}</span>
      <span style={{ ...(smal ? TYP.meta : TYP.listtitel), ...(smal ? { fontWeight: 600 } : {}), textAlign: 'center', lineHeight: 1.15, maxWidth: '100%', overflow: 'hidden', wordBreak: 'break-word' }}>{p.etikett}</span>
      {p.pa !== undefined && <span style={{ ...TYP.micro, color: p.pa ? FARG.gron : FARG.text2 }}>{p.pa ? 'På' : 'Av'}</span>}
    </button>
  );

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

  // ── Alla ──
  if (visaAlla) {
    return (
      <>
        <div data-testid="plus-bakgrund" onClick={stangBakgrund} style={{ position: 'fixed', inset: 0, background: FARG.bg, opacity: 0.45, zIndex: 640 }} />
        <div role="dialog" aria-label="Alla" data-testid="plus-alla-panel" style={{ ...ark, maxHeight: '88vh', display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
          {grepp}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m }}>
            <button type="button" data-testid="plus-alla-tillbaka" onClick={() => setVisaAlla(false)} style={{ minHeight: 44, minWidth: 44, border: 'none', background: 'none', color: FARG.bla, fontFamily: 'inherit', cursor: 'pointer', ...TYP.text }}>‹ Dockan</button>
            <span style={{ ...TYP.rubrik }}>Alla</span>
            <button type="button" data-testid="plus-flerval" onClick={onFlerVal} style={{ minHeight: 44, minWidth: 44, border: 'none', background: 'none', color: FARG.bla, fontFamily: 'inherit', cursor: 'pointer', ...TYP.text }}>Fler val ›</button>
          </div>
          <div style={{ ...TYP.meta, color: FARG.text2 }}>Håll fingret på en symbol för att fästa den i dockan (max {MAX_FASTA}).</div>
          <div style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', gap: AVSTAND.l, paddingBottom: AVSTAND.s }}>
            {alla.map((s) => (
              <section key={s.id} data-testid={`plus-sektion-${s.id}`}>
                <div style={{ ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.s }}>{s.rubrik}</div>
                {s.slag === 'ruta' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${smal ? 96 : 120}px, 1fr))`, gap: AVSTAND.s }}>
                    {s.poster.map((p) => ruta(p, ALLA_RUTA_PX, `plus-alla-${p.nyckel}`))}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {s.poster.map((p) => (
                      <button
                        key={p.nyckel}
                        type="button"
                        data-testid={`plus-alla-${p.nyckel}`}
                        data-fast={p.fast ? '1' : '0'}
                        data-fastbar={p.fastbar === false ? '0' : '1'}
                        data-pa={p.pa ? '1' : '0'}
                        {...hallProps(p, () => onPost(p.nyckel))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: 56, padding: `${AVSTAND.s}px 0`, border: 'none', borderBottom: `1px solid ${FARG.linje}`,
                          background: 'transparent', color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left', touchAction: 'manipulation', WebkitTouchCallout: 'none', userSelect: 'none', ...TYP.text,
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0 }}>{p.etikett}</span>
                        <span style={{ ...TYP.meta, color: p.pa ? FARG.gron : FARG.text2, ...TNUM }}>{p.pa ? 'På' : 'Av'}</span>
                        <span aria-hidden="true" style={{ width: 44, height: 26, borderRadius: RADIE.sheet, padding: AVSTAND.xs / 2, boxSizing: 'border-box', background: p.pa ? FARG.gron : FARG.fyllning, flexShrink: 0 }}>
                          <span style={{ display: 'block', width: 22, height: 22, borderRadius: '50%', background: FARG.text, transform: p.pa ? 'translateX(18px)' : 'translateX(0)', transition: `transform ${RORELSE.tryck}ms ${RORELSE.kurva}` }} />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
        {hallKort}
      </>
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
