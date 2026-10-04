'use client';
// GROT-listan som ark i /oversikt-v2 (chippen "GROT · N" på kartan). Kartan syns ovanför arket.
// Ren presentation — data, avstånd och "står här" kommer in som props, så samma komponent kan renderas mot
// fixturer utan inloggning och databas.
//
// HALVLÄGE: arket öppnar på ca 45 % av kartans höjd så kartan syns (v2 passar in kartan över arket, se page.tsx);
// dra handtaget uppåt för hela listan (ca 85 %), nedåt för att gå tillbaka — och dras halvläget ner stänger det. Ett
// tryck på handtaget stänger, som i de andra arken. Draget flyttar arkets höjd direkt i DOM:en (ingen omritning av 28
// rader per pekarhändelse) och bokför läget först när fingret släpps.
//
// Två grupper: överst "Markägaren vill ha det bort" (de med datum), under "När det passar · äldst först".
// Tom grupp visas inte alls. Rad (kanvasen): namn · [orange: senast <datum>, och i rött "försenad" när datumet har
// passerat] · [orange: planeringens markvillkor, t.ex. "dålig bärighet"] · avverkat <datum> · N dgr, till höger skördad
// volym och under den vägavstånd till närmaste andra GROT-objekt, eller "X står här". Skälet (grot_skal) visas inte.
// Tryck på en rad → v2 flyger dit och byter till objekt-arket (GrotObjektArk).

import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { AVSTAND, FARG, RADIE, TNUM, TYP, overgang } from '@/lib/design/tokens';
import { avverkatText, FORSENAD_TEXT, markBegransningText, senastText, tusental } from '@/lib/grotvy/format';
import { arForsenad, type GrotLista, type GrotRad } from '@/lib/grotvy/lista';
import { Grabber, SheetBas } from './ark-delar';

export type ArkLage = 'halv' | 'full';
/** Arkets höjd som andel av kartans höjd — INKLUSIVE arkets egen padding (boxSizing: border-box nedan; med content-box räknade
 *  maxHeight bara innehållet, och arket blev ≈ 36 px högre än andelen, 49,7 % i stället för 45 %). */
export const ARK_ANDEL: Record<ArkLage, number> = { halv: 0.45, full: 0.85 };
const hojdFor = (l: ArkLage) => `${ARK_ANDEL[l] * 100}%`;
const STANG_NAR_UNDER_HALVLAGE_PX = 70; // dras halvläget så här långt ner → arket stängs
const DRAG_STARTAR_PX = 6;               // mindre rörelse än så är ett tryck, inte ett drag
const HOJD_OVERGANG = overgang('max-height');

function Gruppetikett({ text, farg, forst }: { text: string; farg: string; forst: boolean }) {
  return <div style={{ ...TYP.micro, color: farg, margin: `${forst ? 0 : AVSTAND.l}px 0 ${AVSTAND.s}px` }}>{text}</div>;
}

function RadKnapp({ rad, idag, hoger, onOppna }: { rad: GrotRad; idag: string; hoger: string; onOppna: () => void }) {
  return (
    <button onClick={onOppna} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, width: '100%', minHeight: 64,
      padding: `${AVSTAND.m}px ${AVSTAND.l}px`, marginBottom: AVSTAND.s, boxSizing: 'border-box', textAlign: 'left',
      background: FARG.upphojt, color: FARG.text, border: 'none', borderRadius: RADIE.kort, cursor: 'pointer', fontFamily: 'inherit',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ ...TYP.listtitel, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rad.namn}</div>
        {rad.senast && (
          <div style={{ ...TYP.meta, color: FARG.orange }}>
            {senastText(rad.senast, idag)}
            {arForsenad(rad) && <span style={{ color: FARG.rod }}> · {FORSENAD_TEXT}</span>}
          </div>
        )}
        {markBegransningText(rad.barighet) && <div style={{ ...TYP.meta, color: FARG.orange }}>{markBegransningText(rad.barighet)}</div>}
        <div style={{ ...TYP.meta, color: FARG.text2 }}>{avverkatText(rad.avverkat, idag)}</div>
      </div>
      {/* Högerkolumnen får högst knappt hälften: på en telefon (≈310 px inuti raden) annars trycker
          "20 km från Rödby 2:6 S-P RP -25" ihop namnet till "Hålabäck au …". Långt grannamn kapas, km syns alltid. */}
      <div style={{ flex: '0 1 auto', minWidth: 0, maxWidth: '46%', textAlign: 'right' }}>
        <div style={{ ...TYP.listtitel, ...TNUM, whiteSpace: 'nowrap' }}>
          <span style={{ ...TYP.meta, color: FARG.text2 }}>skördat </span>{tusental(rad.skordatM3)} m³
        </div>
        <div style={{ ...TYP.meta, color: FARG.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hoger}</div>
      </div>
    </button>
  );
}

export default function GrotListaArk({ lista, idag, hogerText, onOppna, onClose, startScroll, onScroll, startLage, onLage }: {
  lista: GrotLista;
  idag: string;
  /** Radens högra andrarad: "Wisent står här", "11 km från Rössmåla" eller "–". */
  hogerText: (rad: GrotRad) => string;
  onOppna: (rad: GrotRad) => void;
  onClose: () => void;
  /** Rullningsläget när arket öppnades — så tillbaka-pilen från ett objekt landar där man var. */
  startScroll: number;
  onScroll: (px: number) => void;
  /** Läget arket öppnar i: 'halv' när listan öppnas från chippen, och det man lämnade när man kommer tillbaka från ett objekt. */
  startLage: ArkLage;
  onLage: (lage: ArkLage) => void;
}) {
  const rullRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (rullRef.current) rullRef.current.scrollTop = startScroll; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── drag i handtaget ──
  const arkRef = useRef<HTMLDivElement>(null);
  const lageRef = useRef<ArkLage>(startLage);
  const dra = useRef<{ startY: number; kartH: number; start: ArkLage; flyttad: boolean; mal: number } | null>(null);
  const nyligenDragit = useRef(false);
  const stangRef = useRef(onClose); stangRef.current = onClose;
  const lageCbRef = useRef(onLage); lageCbRef.current = onLage;

  const flytta = useCallback((e: PointerEvent) => {
    const d = dra.current; const ark = arkRef.current; if (!d || !ark) return;
    const dy = e.clientY - d.startY;
    if (!d.flyttad) {
      if (Math.abs(dy) < DRAG_STARTAR_PX) return;
      d.flyttad = true; ark.style.transition = 'none';
    }
    d.mal = Math.max(0, Math.min(d.kartH * ARK_ANDEL.full, d.kartH * ARK_ANDEL[d.start] - dy));
    ark.style.maxHeight = `${d.mal}px`;
  }, []);
  const slapp = useCallback(() => {
    window.removeEventListener('pointermove', flytta); window.removeEventListener('pointerup', slapp); window.removeEventListener('pointercancel', slapp);
    const d = dra.current; dra.current = null; const ark = arkRef.current;
    if (!d || !ark || !d.flyttad) return;
    nyligenDragit.current = true; window.setTimeout(() => { nyligenDragit.current = false; }, 0); // klicket som följer på ett drag är inget "stäng"
    const halvPx = d.kartH * ARK_ANDEL.halv, fullPx = d.kartH * ARK_ANDEL.full;
    if (d.mal < halvPx - STANG_NAR_UNDER_HALVLAGE_PX) { stangRef.current(); return; }
    const ny: ArkLage = d.mal > (halvPx + fullPx) / 2 ? 'full' : 'halv';
    ark.style.transition = HOJD_OVERGANG; ark.style.maxHeight = hojdFor(ny);
    lageRef.current = ny; lageCbRef.current(ny);
  }, [flytta]);
  useEffect(() => () => {
    window.removeEventListener('pointermove', flytta); window.removeEventListener('pointerup', slapp); window.removeEventListener('pointercancel', slapp);
  }, [flytta, slapp]);
  const borja = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const ark = arkRef.current; const foralder = ark?.parentElement; if (!ark || !foralder) return;
    dra.current = { startY: e.clientY, kartH: foralder.clientHeight, start: lageRef.current, flyttad: false, mal: foralder.clientHeight * ARK_ANDEL[lageRef.current] };
    window.addEventListener('pointermove', flytta); window.addEventListener('pointerup', slapp); window.addEventListener('pointercancel', slapp);
  };

  return (
    <div ref={arkRef} className="sheet-upp" role="dialog" aria-label="GROT-listan"
      style={{ ...SheetBas, boxSizing: 'border-box', maxHeight: hojdFor(startLage), overflow: 'hidden', transition: HOJD_OVERGANG }}>
      {/* Dra-området: handtag + rubrikrad. touch-action:none så webbläsaren inte börjar rulla/dra sidan i stället. */}
      <div onPointerDown={borja} style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'grab' }}>
        <Grabber onClose={() => { if (!nyligenDragit.current) onClose(); }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: AVSTAND.s }}>
          <div style={{ ...TYP.rubrik }}>GROT</div>
          <div style={{ ...TYP.meta, color: FARG.text2 }}>{lista.alla.length} objekt</div>
        </div>
      </div>
      <div ref={rullRef} onScroll={(e) => onScroll(e.currentTarget.scrollTop)}
        style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {lista.markagaren.length > 0 && (
          <>
            <Gruppetikett text="Markägaren vill ha det bort" farg={FARG.orange} forst />
            {lista.markagaren.map((r) => <RadKnapp key={r.id} rad={r} idag={idag} hoger={hogerText(r)} onOppna={() => onOppna(r)} />)}
          </>
        )}
        {lista.passar.length > 0 && (
          <>
            <Gruppetikett text="När det passar · äldst först" farg={FARG.text2} forst={lista.markagaren.length === 0} />
            {lista.passar.map((r) => <RadKnapp key={r.id} rad={r} idag={idag} hoger={hogerText(r)} onOppna={() => onOppna(r)} />)}
          </>
        )}
      </div>
    </div>
  );
}
