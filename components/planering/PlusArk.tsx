'use client';

// PLUS-ARKET ("Alla"), Apple-modell: ett ark som täcker halva skärmen och kan dras upp till hel — kartan syns ovanför. Överst en
// flikväljare (Symboler · Ytor · Spårning · Lager) och ett kryss. Redigera uppe till vänster i Symboler-fliken.
//
//   Symboler  de sex kategorierna som i appen, namnet som liten grå rubrik, symbolerna som färgade cirklar. Tryck = samma flöde som dockan.
//   Ytor      listan över numrerade ytor (hänsyn, traktdelar, egna områden) — tryck öppnar ytkortet.
//   Spårning  hyttspåren: mitt spår, den andra maskinens spår, uppdatera.
//   Lager     alla lager i sina grupper, med liten förhandsbild och en iOS-strömbrytare.
//
// Ren presentation: vad ett tryck GÖR (placera, växla lager, öppna ytkort, spara dockan) avgör sidan. Reglerna för Redigera
// och arkets lägen bor i lib/plusArk (testade); dockans regler i lib/plusRad.

import React, { useEffect, useRef, useState } from 'react';
import { AVSTAND, FARG, RADIE, RORELSE, TNUM, TYP, medSafeBotten } from '@/lib/design/tokens';
import {
  FLIKAR, arAndrad, dragHojd, flyttaPlats, laggTillPlats, ligger, platsUnderFinger, startaRedigering, taBortPlats, valjDetent,
  type Detent, type FlikId,
} from '@/lib/plusArk';
import { MAX_FASTA, nyckelTillPost, postNyckel, type PlusPost } from '@/lib/plusRad';

export interface PlusPostVy {
  nyckel: string;
  etikett: string;
  /** ikon för posten (sidans postVy bygger den; arket ritar symboler som cirklar med dockFarg/dockGlyf) */
  ikon: React.ReactNode;
  fast: boolean;
  /** lager: På/Av */
  pa?: boolean;
  /** symbol: går att lägga i dockan. Lager, Rita och mät går inte — och inte heller de två som bor i pillen. */
  fastbar?: boolean;
  /** cirkelns färg = symbolens riktiga färg på kartan, ringen runt den, och glyfen i mitten */
  dockFarg?: string;
  dockRing?: string;
  dockGlyf?: React.ReactNode;
}

export interface SymbolKategori { id: string; rubrik: string; poster: PlusPostVy[] }

export interface YtaRad {
  nyckel: string;
  nr: number;
  typ: string;
  /** första raden av Vidas text, annars Kompersmålas anteckning; null → "Ingen anteckning" */
  text: string | null;
  harLjud: boolean;
  harFoto: boolean;
  onTryck: () => void;
}

/** vaxel = strömbrytare, val = en av flera (bock), knapp = går vidare/utför något (ingen brytare) */
export type LagerRadTyp = 'vaxel' | 'val' | 'knapp';
export interface LagerRad {
  id: string;
  namn: string;
  under?: string;
  typ: LagerRadTyp;
  /** vaxel: på. val: vald. */
  pa?: boolean;
  /** liten förhandsbild: en CSS-bakgrund (gradient/färg) */
  bild?: string;
  onTryck: () => void;
}
export interface LagerGrupp { id: string; rubrik?: string; rader: LagerRad[] }

export interface SparningData {
  rader: LagerRad[];
  /** när spåren inte går att visa (bara körvyn ritar dem): en förklaring i stället för döda reglage */
  forklaring?: string;
}

export interface ArkData {
  symboler: SymbolKategori[];
  ytor: YtaRad[];
  sparning: SparningData;
  lager: LagerGrupp[];
}

const GREPP_HOJD_PX = AVSTAND.xl + AVSTAND.xs;           // 28
const CIRKEL_PX = 52;                                     // symbolcirkeln
const TILE_PX = 92;                                       // en symbolruta (cirkel + namn)
const BADGE_PX = AVSTAND.xl;                              // 24 — plus/minus/bock
const BADGE_TRAFF_PX = 44;                                // träffytan runt badgen
const BRYTARE_B = 51, BRYTARE_H = 31, BRYTARE_KNOPP = 27; // iOS-strömbrytare
const BILD_B = 64, BILD_H = 44;                           // förhandsbilden i en lagerrad
const FLIK_HOJD = 36;
const DRAG_START_PX = 8;

const Kryss = () => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={FARG.text2} strokeWidth="2.6" strokeLinecap="round">
    <path d="M6 6 L18 18" /><path d="M18 6 L6 18" />
  </svg>
);
const Bock = ({ farg }: { farg: string }) => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={farg} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12 L10 17 L19 7" /></svg>
);
const Pil = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={FARG.text3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6 L15 12 L9 18" /></svg>
);

function Brytare({ pa }: { pa: boolean }) {
  return (
    <span aria-hidden="true" style={{ position: 'relative', flexShrink: 0, width: BRYTARE_B, height: BRYTARE_H, borderRadius: BRYTARE_H / 2, background: pa ? FARG.gron : FARG.fyllning, transition: `background ${RORELSE.tryck}ms ${RORELSE.kurva}` }}>
      <span style={{ position: 'absolute', top: (BRYTARE_H - BRYTARE_KNOPP) / 2, left: (BRYTARE_H - BRYTARE_KNOPP) / 2, width: BRYTARE_KNOPP, height: BRYTARE_KNOPP, borderRadius: '50%', background: FARG.text,
        transform: pa ? `translateX(${BRYTARE_B - BRYTARE_H}px)` : 'translateX(0)', transition: `transform ${RORELSE.tryck}ms ${RORELSE.kurva}` }} />
    </span>
  );
}

/** Symbolens cirkel: samma färg och glyf som på kartan (och i dockan). */
function Cirkel({ p, px = CIRKEL_PX }: { p: PlusPostVy; px?: number }) {
  return (
    <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: px, height: px, borderRadius: RADIE.cirkel, boxSizing: 'border-box',
      background: p.dockFarg ?? FARG.upphojt, boxShadow: `0 0 0 ${AVSTAND.xs / 2}px ${p.dockRing ?? FARG.fyllning}` }}>
      {p.dockGlyf}
    </span>
  );
}

export function PlusArk({ data, flik, onFlik, bred, dockNu, onPost, onSparaDocka, onStang }: {
  data: ArkData;
  flik: FlikId;
  onFlik: (f: FlikId) => void;
  /** minst 760 px brett: allt i en rad överst och två kolumner av kategorier/grupper */
  bred: boolean;
  /** dockans platser just nu (fasta först, sedan mest använda) */
  dockNu: PlusPostVy[];
  onPost: (nyckel: string) => void;
  /** Klar i Redigera: dockans nya platser (nycklar, i ordning). Anropas bara om något ändrats. */
  onSparaDocka: (nycklar: string[]) => void;
  onStang: () => void;
}) {
  const [detent, setDetent] = useState<Detent>('halv');
  const [dragPx, setDragPx] = useState<number | null>(null);
  const drag = useRef<{ y0: number; h0: number; flyttat: boolean } | null>(null);
  const arkRef = useRef<HTMLDivElement>(null);
  const monterad = useRef(Date.now());
  const [redigerar, setRedigerar] = useState(false);
  const [lista, setLista] = useState<PlusPost[]>([]);
  const [medd, setMedd] = useState<string | null>(null);
  const meddTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (meddTimer.current) clearTimeout(meddTimer.current); }, []);

  // Alla symbolers utseende per nyckel — Redigera visar dockans platser och kategoriernas symboler med samma cirklar.
  const symbolPerNyckel = new Map<string, PlusPostVy>();
  for (const k of data.symboler) for (const p of k.poster) symbolPerNyckel.set(p.nyckel, p);
  const dockPosterNu: PlusPost[] = startaRedigering(dockNu.map((p) => nyckelTillPost(p.nyckel)).filter((p): p is PlusPost => !!p));

  const stangBakgrund = () => { if (Date.now() - monterad.current < 450) return; onStang(); };

  // ── Arkets höjd: halv eller hel, dras på gripen ──
  const fonsterH = () => (typeof window !== 'undefined' ? window.innerHeight : 800);
  const gripDown = (e: React.PointerEvent) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
    drag.current = { y0: e.clientY, h0: arkRef.current?.getBoundingClientRect().height ?? fonsterH() / 2, flyttat: false };
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
    if (d.flyttat) setDetent(valjDetent(detent, e.clientY - d.y0));
    else setDetent(detent === 'halv' ? 'hel' : 'halv');
  };

  // ── Redigera ──
  const startaRedigera = () => { setLista(dockPosterNu); setMedd(null); setRedigerar(true); };
  const klar = () => {
    if (arAndrad(dockPosterNu, lista)) onSparaDocka(lista.map(postNyckel));
    setRedigerar(false);
  };
  const visaMedd = (t: string) => {
    setMedd(t);
    if (meddTimer.current) clearTimeout(meddTimer.current);
    meddTimer.current = setTimeout(() => setMedd(null), 2400);
  };
  const laggTill = (p: PlusPostVy) => {
    const post = nyckelTillPost(p.nyckel); if (!post) return;
    const r = laggTillPlats(lista, post);
    if (r.ok) { setLista(r.lista); return; }
    if (r.skal === 'full') visaMedd(`Dockan är full (${MAX_FASTA}/${MAX_FASTA}) — ta bort en först`);
  };

  // Dra för att ändra ordning (bara dockkortet i Redigera). DOM-ordningen ligger fast under draget — platserna flyttas med transform,
  // så fingret behåller sin pekarfångst.
  // Platserna ligger i en rad på bred skärm och i tre kolumner × två rader på smal (annars får namnen inte plats).
  const kolumner = bred ? MAX_FASTA : 3;
  const slotRad = useRef<HTMLDivElement>(null);
  const [slotDrag, setSlotDrag] = useState<{ fran: number; till: number; dx: number; dy: number; x0: number; y0: number; flyttat: boolean } | null>(null);
  /** cellens mått och radens läge (höjden = första platsens + radavståndet; offsetHeight påverkas inte av dragets transform) */
  const slotMatt = () => {
    const rad = slotRad.current;
    if (!rad) return { w: 0, h: 0, left: 0, top: 0 };
    const r = rad.getBoundingClientRect();
    const forsta = rad.children[0] as HTMLElement | undefined;
    return { w: r.width / kolumner, h: forsta ? forsta.offsetHeight + AVSTAND.s : 0, left: r.left, top: r.top };
  };
  const slotDown = (i: number) => (e: React.PointerEvent) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
    setSlotDrag({ fran: i, till: i, dx: 0, dy: 0, x0: e.clientX, y0: e.clientY, flyttat: false });
  };
  const slotMove = (e: React.PointerEvent) => {
    setSlotDrag((d) => {
      if (!d) return d;
      const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
      const flyttat = d.flyttat || Math.hypot(dx, dy) > DRAG_START_PX;
      if (!flyttat) return d;
      const m = slotMatt();
      const mittar = lista.map((_, k) => ({ x: m.left + ((k % kolumner) + 0.5) * m.w, y: m.top + Math.floor(k / kolumner) * m.h + m.h / 2 }));
      return { ...d, dx, dy, flyttat, till: Math.max(0, platsUnderFinger(e.clientX, e.clientY, mittar)) };
    });
  };
  const slotUp = () => {
    const d = slotDrag; setSlotDrag(null);
    if (d && d.flyttat && d.till !== d.fran) setLista((l) => flyttaPlats(l, d.fran, d.till));
  };

  // ── Delar ──
  const flikRad = (
    <div role="tablist" aria-label="Plus" data-testid="plus-ark-flikar" style={{ display: 'flex', gap: AVSTAND.xs / 2, padding: AVSTAND.xs / 2, background: FARG.upphojt, borderRadius: RADIE.knapp, minWidth: 0 }}>
      {FLIKAR.map((f) => {
        const vald = f.id === flik;
        return (
          <button key={f.id} type="button" role="tab" aria-selected={vald} aria-disabled={redigerar && !vald} data-testid={`plus-ark-flik-${f.id}`}
            onClick={() => { if (!redigerar) onFlik(f.id); }}
            style={{ flex: bred ? '0 0 auto' : 1, minWidth: 0, minHeight: FLIK_HOJD + AVSTAND.s, padding: `0 ${bred ? AVSTAND.l + AVSTAND.s : AVSTAND.xs}px`, border: 'none', borderRadius: RADIE.rad, cursor: redigerar && !vald ? 'default' : 'pointer',
              background: vald ? FARG.fyllning : 'transparent', color: vald ? FARG.text : FARG.text2, opacity: redigerar && !vald ? 0.4 : 1, fontFamily: 'inherit',
              ...TYP.listtitel, whiteSpace: 'nowrap', touchAction: 'manipulation' }}>
            {f.etikett}
          </button>
        );
      })}
    </div>
  );
  const redigeraKnapp = flik === 'symboler' ? (
    <button type="button" data-testid={redigerar ? 'plus-ark-klar' : 'plus-ark-redigera'} onClick={redigerar ? klar : startaRedigera}
      style={{ minHeight: 44, minWidth: 44, padding: 0, border: 'none', background: 'none', color: FARG.bla, fontFamily: 'inherit', cursor: 'pointer', ...TYP.text, fontWeight: redigerar ? 700 : 400 }}>
      {redigerar ? 'Klar' : 'Redigera'}
    </button>
  ) : <span />;
  const stangKnapp = (
    <button type="button" aria-label="Stäng" data-testid="plus-alla-stang" onClick={onStang}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: RADIE.cirkel, border: 'none', background: FARG.upphojt, cursor: 'pointer', justifySelf: 'end' }}>
      <Kryss />
    </button>
  );

  // En symbolruta i kategorierna. Normalt: tryck = samma flöde som från dockan. I Redigera: tryck = lägg i dockan (grönt plus) / ligger redan (grå bock).
  const symbolRuta = (p: PlusPostVy) => {
    const post = nyckelTillPost(p.nyckel);
    const iDockan = !!post && ligger(lista, post);
    const kanLaggas = p.fastbar !== false;
    const bad = !redigerar ? null : !kanLaggas ? null : iDockan
      ? { bg: FARG.text3, fg: FARG.text, glyf: <Bock farg={FARG.text} />, label: `${p.etikett} ligger i dockan` }
      : { bg: FARG.gron, fg: FARG.bg, glyf: <span style={{ ...TYP.rubrik, lineHeight: `${BADGE_PX}px` }}>+</span>, label: `Lägg ${p.etikett} i dockan` };
    return (
      <button key={p.nyckel} type="button" data-testid={`plus-alla-${p.nyckel}`} data-idockan={iDockan ? '1' : '0'} data-fastbar={kanLaggas ? '1' : '0'}
        aria-label={bad ? bad.label : p.etikett} aria-disabled={redigerar && (!kanLaggas || iDockan)} className="press-scale"
        onClick={() => { if (!redigerar) onPost(p.nyckel); else if (kanLaggas && !iDockan) laggTill(p); }}
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.xs + AVSTAND.xs / 2, width: '100%', maxWidth: TILE_PX, margin: '0 auto', padding: `${AVSTAND.xs}px 0`, border: 'none', background: 'transparent',
          color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation', WebkitTouchCallout: 'none', userSelect: 'none', opacity: redigerar && !kanLaggas ? 0.45 : 1 }}>
        <Cirkel p={p} />
        <span style={{ ...TYP.meta, textAlign: 'center', lineHeight: 1.2, maxWidth: '100%', overflowWrap: 'anywhere' }}>{p.etikett}</span>
        {bad && (
          <span aria-hidden="true" data-testid={`plus-ark-badge-${p.nyckel}`} style={{ position: 'absolute', top: 0, right: `calc(50% - ${CIRKEL_PX / 2 + AVSTAND.s}px)`, width: BADGE_PX, height: BADGE_PX, borderRadius: RADIE.cirkel, background: bad.bg, color: bad.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            {bad.glyf}
          </span>
        )}
      </button>
    );
  };

  // Dockkortet i Redigera: sex platser med rött minus, dra för att ändra ordning
  const dockKort = () => {
    const forhandsvisning = slotDrag && slotDrag.flyttat ? flyttaPlats(lista, slotDrag.fran, slotDrag.till) : lista;
    const m = slotMatt();
    return (
      <div data-testid="plus-ark-dockkort" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px ${AVSTAND.s}px`, background: FARG.upphojt, borderRadius: RADIE.sheet, marginBottom: AVSTAND.l }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.m, alignItems: 'baseline' }}>
          <span style={{ ...TYP.micro, color: FARG.text2 }}>Din docka · <span data-testid="plus-ark-dockantal" style={TNUM}>{lista.length} av {MAX_FASTA}</span></span>
          <span data-testid="plus-ark-dockmedd" style={{ ...TYP.meta, color: medd ? FARG.orange : FARG.text2, textAlign: 'right' }}>{medd ?? 'Dra för att ändra ordning'}</span>
        </div>
        <div ref={slotRad} style={{ display: 'grid', gridTemplateColumns: `repeat(${kolumner}, minmax(0, 1fr))`, columnGap: 0, rowGap: AVSTAND.s, alignItems: 'start', maxWidth: bred ? MAX_FASTA * TILE_PX : undefined }}>
          {Array.from({ length: MAX_FASTA }, (_, i) => {
            const post = lista[i];
            const vy = post ? symbolPerNyckel.get(postNyckel(post)) : undefined;
            if (!post || !vy) {
              return (
                <div key={`tom-${i}`} data-testid={`plus-ark-slot-${i}`} data-tom="1" aria-label="Tom plats — fylls efter användning" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.xs + AVSTAND.xs / 2, padding: `${AVSTAND.xs}px 0` }}>
                  <span aria-hidden="true" style={{ width: CIRKEL_PX, height: CIRKEL_PX, borderRadius: RADIE.cirkel, boxSizing: 'border-box', border: `2px dashed ${FARG.text3}` }} />
                  <span style={{ ...TYP.meta, color: FARG.text3, textAlign: 'center' }}>Tom</span>
                </div>
              );
            }
            const minDrag = slotDrag && slotDrag.fran === i && slotDrag.flyttat;
            const nyIdx = forhandsvisning.findIndex((q) => postNyckel(q) === postNyckel(post));
            const dx = minDrag ? slotDrag!.dx : ((nyIdx % kolumner) - (i % kolumner)) * m.w;
            const dy = minDrag ? slotDrag!.dy : (Math.floor(nyIdx / kolumner) - Math.floor(i / kolumner)) * m.h;
            return (
              <div key={postNyckel(post)} data-testid={`plus-ark-slot-${i}`} data-nyckel={postNyckel(post)} onPointerDown={slotDown(i)} onPointerMove={slotMove} onPointerUp={slotUp} onPointerCancel={() => setSlotDrag(null)}
                style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.xs + AVSTAND.xs / 2, padding: `${AVSTAND.xs}px 0`, touchAction: 'none', userSelect: 'none', WebkitTouchCallout: 'none', cursor: minDrag ? 'grabbing' : 'grab',
                  transform: `translate(${dx}px, ${dy}px)${minDrag ? ' scale(1.08)' : ''}`, transition: minDrag ? 'none' : `transform ${RORELSE.byte}ms ${RORELSE.kurva}`, zIndex: minDrag ? 2 : 1 }}>
                <div style={{ position: 'relative', width: CIRKEL_PX, height: CIRKEL_PX }}>
                  <Cirkel p={vy} px={CIRKEL_PX} />
                  {/* Rött minus i cirkelns övre vänstra hörn; träffytan är 44 px runt det */}
                  <button type="button" data-testid={`plus-ark-minus-${postNyckel(post)}`} aria-label={`Ta bort ${vy.etikett} ur dockan`} onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setLista((l) => taBortPlats(l, postNyckel(post)))}
                    style={{ position: 'absolute', top: AVSTAND.xs - BADGE_TRAFF_PX / 2, left: AVSTAND.xs - BADGE_TRAFF_PX / 2, width: BADGE_TRAFF_PX, height: BADGE_TRAFF_PX, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span aria-hidden="true" style={{ width: BADGE_PX, height: BADGE_PX, borderRadius: RADIE.cirkel, background: FARG.rod, color: FARG.text, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYP.rubrik, lineHeight: 1 }}>−</span>
                  </button>
                </div>
                <span style={{ ...TYP.meta, textAlign: 'center', lineHeight: 1.2, maxWidth: '100%', overflowWrap: 'anywhere' }}>{vy.etikett}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const gruppRubrik = (t: string) => <div style={{ ...TYP.micro, color: FARG.text2, margin: `0 ${AVSTAND.xs}px ${AVSTAND.s}px` }}>{t}</div>;

  const symbolerFlik = (
    <div data-testid="plus-ark-symboler">
      {/* Smal skärm: flikarna och krysset delar översta raden, så Redigera/Klar sitter uppe till vänster i själva Symboler-fliken. */}
      {!bred && <div style={{ display: 'flex', marginBottom: AVSTAND.xs }}>{redigeraKnapp}</div>}
      {redigerar && dockKort()}
      <div style={{ display: 'grid', gridTemplateColumns: bred ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: `${AVSTAND.l}px ${AVSTAND.xxl + AVSTAND.s}px` }}>
        {data.symboler.map((k) => (
          <section key={k.id} data-testid={`plus-sektion-${k.id}`}>
            {gruppRubrik(k.rubrik)}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_PX - AVSTAND.s}px, 1fr))`, rowGap: AVSTAND.s }}>{k.poster.map(symbolRuta)}</div>
          </section>
        ))}
      </div>
    </div>
  );

  const ytorFlik = (
    <div data-testid="plus-ark-ytor">
      {data.ytor.length === 0 ? (
        <div data-testid="plus-ark-ytor-tom" style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.xl}px ${AVSTAND.s}px`, textAlign: 'center' }}>
          Inga numrerade ytor på objektet. Hänsynsytor från Vida, traktdelar och egna områden dyker upp här när de finns.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: bred ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: AVSTAND.s }}>
          {data.ytor.map((y) => (
            <button key={y.nyckel} type="button" data-testid={`plus-ark-yta-${y.nyckel}`} className="press-row" onClick={y.onTryck}
              style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: 56, width: '100%', padding: `${AVSTAND.s}px ${AVSTAND.m}px`, textAlign: 'left', border: 'none', borderRadius: RADIE.kort, background: FARG.upphojt, color: FARG.text, fontFamily: 'inherit', cursor: 'pointer' }}>
              <span aria-hidden="true" style={{ width: 28, height: 28, flexShrink: 0, borderRadius: RADIE.cirkel, background: FARG.fyllning, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYP.meta, fontWeight: 700, ...TNUM }}>{y.nr}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', ...TYP.listtitel }}>{y.typ}</span>
                <span style={{ display: 'block', ...TYP.meta, color: y.text ? FARG.text2 : FARG.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{y.text || 'Ingen anteckning'}</span>
              </span>
              {(y.harLjud || y.harFoto) && (
                <span style={{ display: 'inline-flex', gap: AVSTAND.xs, flexShrink: 0, ...TYP.meta }}>
                  {y.harLjud && <span role="img" aria-label="Ljud">🎤</span>}
                  {y.harFoto && <span role="img" aria-label="Foto">📷</span>}
                </span>
              )}
              <Pil />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // En rad i Spårning/Lager: liten förhandsbild, namn (+ ev. under), strömbrytare / bock / pil till höger
  const lagerRad = (r: LagerRad, sist: boolean, gid: string) => (
    <button key={r.id} type="button" data-testid={`plus-lager-${gid}-${r.id}`} data-pa={r.typ === 'knapp' ? undefined : r.pa ? '1' : '0'} data-typ={r.typ}
      role={r.typ === 'vaxel' ? 'switch' : undefined} aria-checked={r.typ === 'vaxel' ? !!r.pa : undefined}
      onClick={r.onTryck}
      style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: BILD_H + AVSTAND.l + AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, textAlign: 'left', border: 'none', borderBottom: sist ? 'none' : `1px solid ${FARG.linje}`, background: 'transparent',
        color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation' }}>
      {r.bild && <span aria-hidden="true" style={{ flexShrink: 0, width: BILD_B, height: BILD_H, borderRadius: RADIE.rad - AVSTAND.xs / 2, background: r.bild, boxShadow: `inset 0 0 0 1px ${FARG.linje}` }} />}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', ...TYP.text }}>{r.namn}</span>
        {r.under && <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>{r.under}</span>}
      </span>
      {r.typ === 'vaxel' && <Brytare pa={!!r.pa} />}
      {r.typ === 'val' && <span style={{ width: BADGE_PX, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{r.pa && <Bock farg={FARG.bla} />}</span>}
      {r.typ === 'knapp' && <Pil />}
    </button>
  );

  const grupp = (g: LagerGrupp) => (
    <section key={g.id} data-testid={`plus-lagergrupp-${g.id}`}>
      {g.rubrik && gruppRubrik(g.rubrik)}
      <div style={{ background: FARG.upphojt, borderRadius: RADIE.sheet, overflow: 'hidden' }}>{g.rader.map((r, i) => lagerRad(r, i === g.rader.length - 1, g.id))}</div>
    </section>
  );

  const sparningFlik = (
    <div data-testid="plus-ark-sparning">
      {data.sparning.forklaring
        ? <div data-testid="plus-ark-sparning-tom" style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.xl}px ${AVSTAND.s}px`, textAlign: 'center' }}>{data.sparning.forklaring}</div>
        : grupp({ id: 'sparning', rader: data.sparning.rader })}
    </div>
  );

  const lagerFlik = (
    <div data-testid="plus-ark-lager" style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${bred ? 320 : 280}px, 1fr))`, gap: `${AVSTAND.l}px ${AVSTAND.xl}px`, alignItems: 'start' }}>
      {data.lager.map(grupp)}
    </div>
  );

  // Procent av fönstret (arket är position: fixed) — fungerar överallt, till skillnad från dvh som äldre iOS saknar.
  const hojd = dragPx != null ? `${dragPx}px` : detent === 'hel' ? `calc(100% - env(safe-area-inset-top, 0px) - ${AVSTAND.s}px)` : '50%';

  return (
    <>
      <div data-testid="plus-bakgrund" onClick={stangBakgrund} style={{ position: 'fixed', inset: 0, zIndex: 640 }} />
      <div ref={arkRef} role="dialog" aria-label="Alla" data-testid="plus-alla-panel" data-detent={detent} data-redigerar={redigerar ? '1' : '0'}
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 650, boxSizing: 'border-box', background: FARG.kort, color: FARG.text, fontFamily: 'inherit', display: 'flex', flexDirection: 'column',
          borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`, borderTop: `1px solid ${FARG.linje}`, height: hojd, maxHeight: '100%',
          transition: dragPx != null ? 'none' : `height ${RORELSE.sheet}ms ${RORELSE.kurva}` }}>
        <button type="button" aria-label={detent === 'halv' ? 'Dra upp arket' : 'Dra ned arket'} data-testid="plus-ark-grepp"
          onPointerDown={gripDown} onPointerMove={gripMove} onPointerUp={gripUp} onPointerCancel={() => { drag.current = null; setDragPx(null); }}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: GREPP_HOJD_PX, padding: 0, border: 'none', background: 'transparent', cursor: 'grab', touchAction: 'none' }}>
          <span style={{ width: AVSTAND.xxl + AVSTAND.s, height: AVSTAND.xs, borderRadius: AVSTAND.xs, background: FARG.text3 }} />
        </button>

        <div style={{ flexShrink: 0, display: 'grid', alignItems: 'center', gap: `${AVSTAND.xs}px ${AVSTAND.m}px`, padding: `0 ${AVSTAND.l}px ${AVSTAND.s}px`,
          ...(bred
            ? { gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', gridTemplateAreas: '"redigera flikar stang"' }
            : { gridTemplateColumns: 'minmax(0, 1fr) auto', gridTemplateAreas: '"flikar stang"' }) }}>
          {bred && <div style={{ gridArea: 'redigera', justifySelf: 'start' }}>{redigeraKnapp}</div>}
          <div style={{ gridArea: 'flikar', minWidth: 0 }}>{flikRad}</div>
          <div style={{ gridArea: 'stang', justifySelf: 'end' }}>{stangKnapp}</div>
        </div>

        <div role="tabpanel" data-testid="plus-ark-innehall" data-flik={flik} style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', padding: `${AVSTAND.s}px ${AVSTAND.l}px`, paddingBottom: medSafeBotten(AVSTAND.xl) }}>
          {flik === 'symboler' && symbolerFlik}
          {flik === 'ytor' && ytorFlik}
          {flik === 'sparning' && sparningFlik}
          {flik === 'lager' && lagerFlik}
        </div>
      </div>
    </>
  );
}
