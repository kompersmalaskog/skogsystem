'use client';
// Listan i /grot: två grupper av rader. Ren presentation — data, avstånd och "står här" kommer in som
// props, så samma komponent kan renderas mot fixturer utan inloggning och databas.
//
// Rad (kanvasen): namn · [orange: senast <datum> · skäl] · avverkat <datum> · N dgr, till höger
// skördad volym och under den avstånd eller "X står här". Tom grupp visas inte alls.

import React from 'react';
import { AVSTAND, FARG, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { avverkatText, senastText, tusental } from '@/lib/grotvy/format';
import type { GrotLista, GrotRad } from '@/lib/grotvy/lista';

function Gruppetikett({ text, farg }: { text: string; farg: string }) {
  return <div style={{ ...TYP.micro, color: farg, margin: `${AVSTAND.sektion}px 0 ${AVSTAND.s}px` }}>{text}</div>;
}

function RadKnapp({ rad, idag, hoger, onOppna }: { rad: GrotRad; idag: string; hoger: string; onOppna: () => void }) {
  return (
    <button onClick={onOppna} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, width: '100%', minHeight: 64,
      padding: `${AVSTAND.m}px ${AVSTAND.l}px`, marginBottom: AVSTAND.s, boxSizing: 'border-box', textAlign: 'left',
      background: FARG.kort, color: FARG.text, border: 'none', borderRadius: RADIE.kort, cursor: 'pointer', fontFamily: 'inherit',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ ...TYP.listtitel, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rad.namn}</div>
        {rad.senast && <div style={{ ...TYP.meta, color: FARG.orange }}>{senastText(rad.senast, rad.skal, idag)}</div>}
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

export default function GrotListaVy({ lista, idag, hogerText, onOppna }: {
  lista: GrotLista;
  idag: string;
  /** Radens högra andrarad: "Wisent står här", "11 km från Rössmåla" eller "–". */
  hogerText: (rad: GrotRad) => string;
  onOppna: (rad: GrotRad) => void;
}) {
  return (
    <div>
      {lista.markagaren.length > 0 && (
        <>
          <Gruppetikett text="Markägaren vill ha det bort" farg={FARG.orange} />
          {lista.markagaren.map((r) => <RadKnapp key={r.id} rad={r} idag={idag} hoger={hogerText(r)} onOppna={() => onOppna(r)} />)}
        </>
      )}
      {lista.passar.length > 0 && (
        <>
          <Gruppetikett text="När det passar · äldst först" farg={FARG.text2} />
          {lista.passar.map((r) => <RadKnapp key={r.id} rad={r} idag={idag} hoger={hogerText(r)} onOppna={() => onOppna(r)} />)}
        </>
      )}
    </div>
  );
}
