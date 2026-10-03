'use client';
// GROT-listan som ark i /oversikt-v2 (chippen "GROT · N" på kartan). Kartan syns ovanför arket.
// Ren presentation — data, avstånd och "står här" kommer in som props, så samma komponent kan renderas mot
// fixturer utan inloggning och databas.
//
// Två grupper: överst "Markägaren vill ha det bort" (de med datum), under "När det passar · äldst först".
// Tom grupp visas inte alls. Rad (kanvasen): namn · [orange: senast <datum>, och i rött "försenad" när datumet har
// passerat] · [orange: bara torrt/tjäle, om markägaren kräver det] · avverkat <datum> · N dgr, till höger skördad
// volym och under den vägavstånd till närmaste andra GROT-objekt, eller "X står här". Skälet (grot_skal) visas inte.
// Tryck på en rad → v2 flyger dit och byter till objekt-arket (GrotObjektArk).

import React, { useLayoutEffect, useRef } from 'react';
import { AVSTAND, FARG, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { avverkatText, FORSENAD_TEXT, markkravText, senastText, tusental } from '@/lib/grotvy/format';
import { arForsenad, type GrotLista, type GrotRad } from '@/lib/grotvy/lista';
import { Grabber, SheetBas } from './ark-delar';

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
        {markkravText(rad.markkrav) && <div style={{ ...TYP.meta, color: FARG.orange }}>{markkravText(rad.markkrav)}</div>}
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

export default function GrotListaArk({ lista, idag, hogerText, onOppna, onClose, startScroll, onScroll }: {
  lista: GrotLista;
  idag: string;
  /** Radens högra andrarad: "Wisent står här", "11 km från Rössmåla" eller "–". */
  hogerText: (rad: GrotRad) => string;
  onOppna: (rad: GrotRad) => void;
  onClose: () => void;
  /** Rullningsläget när arket öppnades — så tillbaka-pilen från ett objekt landar där man var. */
  startScroll: number;
  onScroll: (px: number) => void;
}) {
  const rullRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (rullRef.current) rullRef.current.scrollTop = startScroll; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sheet-upp" role="dialog" aria-label="GROT-listan" style={{ ...SheetBas, maxHeight: '55%', overflow: 'hidden' }}>
      <Grabber onClose={onClose} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: AVSTAND.s }}>
        <div style={{ ...TYP.rubrik }}>GROT</div>
        <div style={{ ...TYP.meta, color: FARG.text2 }}>{lista.alla.length} objekt</div>
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
