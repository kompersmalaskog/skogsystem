'use client';

// PLUS-RADEN — delad komponent för körvyn och planeringen. Sex platser längst ner (ca 180 px): fem poster (fasta först, resten efter
// mest använt — regeln bor i lib/plusRad) och sist "Alla". "Alla" öppnar alla symboler, Rita och mät, och alla lager (växlar).
//
//   håll fingret i Alla  → "Fast i raden"      håll fingret i raden → "Lossa" (fast) / "Fast i raden" (automatisk)
//
// Komponenten är ren presentation + håll-fingret-menyn; vad ett tryck GÖR (placera, växla lager, starta mätning) avgör sidan.
// Plusraden måste vara översta interaktiva lagret (z 640/650, samma som den gamla plusmenyn — minnet om dead-tap-buggen).
// Via designtokens.

import React, { useRef, useState } from 'react';
import { AVSTAND, FARG, RADIE, TNUM, TYP, medSafeBotten } from '@/lib/design/tokens';
import { skapaLangtryck } from '@/lib/langtryck';
import { MAX_FASTA } from '@/lib/plusRad';

export interface PlusPostVy {
  nyckel: string;
  etikett: string;
  ikon: React.ReactNode;
  fast: boolean;
  /** lager: På/Av (visas som ord under namnet, färg bär aldrig ensam) */
  pa?: boolean;
}

export interface AllaSektion {
  id: string;
  rubrik: string;
  /** 'ruta' = tryckbara rutor i rutnät, 'vaxel' = rader med På/Av-reglage */
  slag: 'ruta' | 'vaxel';
  poster: PlusPostVy[];
}

export interface HallSvar { ok: boolean; text: string }

const RAD_TILE_BRED_PX = 128;
const RAD_TILE_SMAL_PX = 64;      // 3 × 2 på telefon: två rader à 64 px + marginaler ≈ 184 px (raden ska vara ca 180 px)
const ALLA_RUTA_PX = 96;
const BACKDROP_GUARD_MS = 450;     // ett långtryck på kartan öppnar raden; fingerlyftet får inte stänga den direkt

const Nal = ({ pa }: { pa: boolean }) => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill={pa ? FARG.text : FARG.text2} style={{ position: 'absolute', top: AVSTAND.s, right: AVSTAND.s }}>
    <path d="M14 3l7 7-3 1-3.5 3.5.5 4.5-1.5 1.5-4-4-5.5 5.5-1-1L9.5 14l-4-4L7 8.5 11.5 9 15 5.5z" />
  </svg>
);

const AllaIkon = ({ px }: { px: number }) => (
  <svg aria-hidden="true" width={px} height={px} viewBox="0 0 24 24" fill={FARG.text}>
    <rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" />
    <rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" />
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
  const lt = useRef(skapaLangtryck()).current;
  const monterad = useRef(Date.now());

  const stangBakgrund = () => { if (Date.now() - monterad.current < BACKDROP_GUARD_MS) return; onStang(); };
  const hallProps = (p: PlusPostVy, tryck: () => void) => ({
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
    <button type="button" aria-label="Stäng" data-testid="plus-stang" onClick={onStang}
      style={{ display: 'flex', alignSelf: 'center', margin: '0 auto', width: 96, height: AVSTAND.xl, border: 'none', background: 'transparent', cursor: 'pointer', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ width: 40, height: 4, borderRadius: 4, background: FARG.text3 }} />
    </button>
  );

  const ruta = (p: PlusPostVy, hojd: number, testid: string) => (
    <button
      key={p.nyckel}
      type="button"
      data-testid={testid}
      data-fast={p.fast ? '1' : '0'}
      data-pa={p.pa === undefined ? undefined : p.pa ? '1' : '0'}
      className="press-scale"
      {...hallProps(p, () => onPost(p.nyckel))}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: smal ? AVSTAND.xs : AVSTAND.s, minHeight: hojd,
        padding: AVSTAND.s, border: 'none', borderRadius: RADIE.knapp, background: FARG.upphojt, color: FARG.text, fontFamily: 'inherit', cursor: 'pointer',
        touchAction: 'manipulation', WebkitTouchCallout: 'none', userSelect: 'none', minWidth: 0,
      }}
    >
      {p.fast && <Nal pa />}
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
                {hall.fast ? 'Lossa' : 'Fast i raden'}
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
            <button type="button" data-testid="plus-alla-tillbaka" onClick={() => setVisaAlla(false)} style={{ minHeight: 44, minWidth: 44, border: 'none', background: 'none', color: FARG.bla, fontFamily: 'inherit', cursor: 'pointer', ...TYP.text }}>‹ Raden</button>
            <span style={{ ...TYP.rubrik }}>Alla</span>
            <button type="button" data-testid="plus-flerval" onClick={onFlerVal} style={{ minHeight: 44, minWidth: 44, border: 'none', background: 'none', color: FARG.bla, fontFamily: 'inherit', cursor: 'pointer', ...TYP.text }}>Fler val ›</button>
          </div>
          <div style={{ ...TYP.meta, color: FARG.text2 }}>Håll fingret på något för att fästa det i raden (max {MAX_FASTA}).</div>
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
                        data-pa={p.pa ? '1' : '0'}
                        {...hallProps(p, () => onPost(p.nyckel))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: 56, padding: `${AVSTAND.s}px 0`, border: 'none', borderBottom: `1px solid ${FARG.linje}`,
                          background: 'transparent', color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left', touchAction: 'manipulation', WebkitTouchCallout: 'none', userSelect: 'none', ...TYP.text,
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0 }}>{p.etikett}{p.fast ? <span style={{ ...TYP.meta, color: FARG.text2 }}> · fast i raden</span> : null}</span>
                        <span style={{ ...TYP.meta, color: p.pa ? FARG.gron : FARG.text2, ...TNUM }}>{p.pa ? 'På' : 'Av'}</span>
                        <span aria-hidden="true" style={{ width: 44, height: 26, borderRadius: 13, padding: 2, boxSizing: 'border-box', background: p.pa ? FARG.gron : FARG.fyllning, flexShrink: 0 }}>
                          <span style={{ display: 'block', width: 22, height: 22, borderRadius: '50%', background: FARG.text, transform: p.pa ? 'translateX(18px)' : 'translateX(0)', transition: `transform 150ms cubic-bezier(0.2, 0, 0, 1)` }} />
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

  // ── Raden ──
  return (
    <>
      <div data-testid="plus-bakgrund" onClick={stangBakgrund} style={{ position: 'fixed', inset: 0, background: FARG.bg, opacity: 0.45, zIndex: 640 }} />
      <div role="dialog" aria-label="Plus" data-testid="plus-rad" style={ark}>
        {grepp}
        <div style={{ display: 'grid', gridTemplateColumns: smal ? 'repeat(3, minmax(0, 1fr))' : 'repeat(6, minmax(0, 1fr))', gap: AVSTAND.s }}>
          {poster.slice(0, MAX_FASTA).map((p) => ruta(p, smal ? RAD_TILE_SMAL_PX : RAD_TILE_BRED_PX, `plus-post-${p.nyckel}`))}
          <button
            type="button"
            data-testid="plus-alla"
            className="press-scale"
            onClick={() => setVisaAlla(true)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: smal ? AVSTAND.xs : AVSTAND.s, minHeight: smal ? RAD_TILE_SMAL_PX : RAD_TILE_BRED_PX,
              padding: AVSTAND.s, border: 'none', borderRadius: RADIE.knapp, background: FARG.fyllning, color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', ...(smal ? TYP.meta : TYP.listtitel),
              ...(smal ? { fontWeight: 600 } : {}),
            }}
          >
            <AllaIkon px={smal ? AVSTAND.xl + AVSTAND.xs : AVSTAND.xxl} />
            <span>Alla</span>
          </button>
        </div>
      </div>
      {hallKort}
    </>
  );
}
