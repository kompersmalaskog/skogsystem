'use client';

// − / + OCH SIFFERKNAPPSATSEN i lasskortet. Ett tryck = ETT steg (Martin i Elefanten 26/10: + hoppade 1 → 3 eller 4).
// Orsaken till hoppen i den gamla knappen (HallKnapp, borttagen):
//   1. Den gav steget på pointerdown OCH lät klicket efter släppet ge ett till. På en pekskärm kommer pointerout/pointerleave mellan släppet och klicket, och
//      pointerleave nollade spärren ("pekaren har redan gett steget") — så varje tryck gav två steg: 1 → 3.
//   2. Håll-in-upprepningen (efter 350 ms, var 120:e ms) startade på ett tryck som bara vilade lite för länge — en tumme i en skakande hytt — och gav ytterligare 1–2 steg: 1 → 4.
// Nu: bara onClick (EN händelse per tryck, pekaren ger klicket vid släpp), ingen upprepning, och en spärr på SPARR_MS per knapp som sväljer en studsande skärm
// (två klick inom 250 ms). Siffran har fast bredd och tabellsiffror, så − och + aldrig flyttar sig när talet går från 9 till 10.

import React, { useEffect, useRef, useState } from 'react';
import { AVSTAND, FARG, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { knappPrimar, TRYCK_PX } from './stil';
import { SortimentNamn } from './SortimentNamn';

/** Spärr per knapp: ett andra klick inom så här lång tid räknas som studs och ger inget steg. */
export const SPARR_MS = 250;
/** Sifferknappsatsens tangenter är spärrade kortare (ingen upprepning finns; studs inom 100 ms sväljs, men "11" som skrivs snabbt går igenom). */
export const TANGENT_SPARR_MS = 100;
/** Siffran mellan − och +: 24 px fet. Fast bredd (rymmer "1000 m³"), så knapparna sitter still. */
export const SIFFRA_PX = 24;
export const SIFFRA_BREDD = 104;
export const MAX_SIFFROR = 4;

/** Ett klick släpps igenom bara om det gått minst `ms` sedan förra som släpptes igenom (per knapp). */
export function useSparr(ms: number): (fn: () => void) => void {
  const senast = useRef(-Infinity);
  return (fn) => {
    const nu = Date.now();
    if (nu - senast.current < ms) return;
    senast.current = nu;
    fn();
  };
}

const rundKnapp: React.CSSProperties = {
  width: TRYCK_PX, height: TRYCK_PX, borderRadius: RADIE.knapp, border: 'none', background: FARG.fyllning, color: FARG.text, ...TYP.rubrik, fontSize: SIFFRA_PX,
  fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0, padding: 0, touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
};

/** − eller +: ETT steg per tryck. */
export function StegKnapp({ tecken, etikett, onSteg, testid }: { tecken: string; etikett: string; onSteg: () => void; testid: string }) {
  const sparr = useSparr(SPARR_MS);
  return (
    <button type="button" aria-label={etikett} data-testid={testid} onClick={() => sparr(onSteg)} onContextMenu={(e) => e.preventDefault()} style={rundKnapp}>
      {tecken}
    </button>
  );
}

/** Siffran mellan − och +: fast bredd, tabellsiffror. Tryck öppnar sifferknappsatsen. */
export function SiffraKnapp({ varde, etikett, onOppna, testid }: { varde: number; etikett: string; onOppna: () => void; testid: string }) {
  return (
    <button type="button" aria-label={`${etikett}: ${varde} m³. Tryck för att skriva värdet`} data-testid={testid} onClick={onOppna}
      style={{ width: SIFFRA_BREDD, minWidth: SIFFRA_BREDD, maxWidth: SIFFRA_BREDD, height: TRYCK_PX, flexShrink: 0, flexGrow: 0, boxSizing: 'border-box', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
        textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', color: FARG.text, fontFamily: 'inherit', ...TYP.rubrik, fontSize: SIFFRA_PX, ...TNUM }}>
      {varde}<span style={{ ...TYP.text, color: FARG.text2 }}> m³</span>
    </button>
  );
}

const tangentStil: React.CSSProperties = {
  height: 64, borderRadius: RADIE.knapp, border: 'none', background: FARG.fyllning, color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', padding: 0,
  fontSize: 28, fontWeight: 700, ...TNUM, touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none',
};

function Tangent({ tecken, etikett, onTryck, testid, stil }: { tecken: string; etikett?: string; onTryck: () => void; testid: string; stil?: React.CSSProperties }) {
  const sparr = useSparr(TANGENT_SPARR_MS);
  return (
    <button type="button" aria-label={etikett ?? tecken} data-testid={testid} onClick={() => sparr(onTryck)} onContextMenu={(e) => e.preventDefault()} style={{ ...tangentStil, ...stil }}>
      {tecken}
    </button>
  );
}

/**
 * Stor sifferknappsats (0–9, radera, Klar) i appens stil — inget tangentbord från Windows eller iOS. Det man skriver ERSÄTTER värdet: första siffran byter ut det gamla talet.
 * Klar utan att ha skrivit något ändrar inget. Avbryt (eller Esc) lämnar värdet orört. Fysiskt tangentbord fungerar också (skrivbordstest).
 */
export function SifferPlatta({ namn, varde, onKlar, onAvbryt }: { namn: string; varde: number; onKlar: (n: number | null) => void; onAvbryt: () => void }) {
  const [text, setText] = useState('');
  const textRef = useRef('');
  textRef.current = text;
  const sifra = (d: string) => setText((t) => (t === '0' ? d : (t + d).slice(0, MAX_SIFFROR)));
  const radera = () => setText((t) => t.slice(0, -1));
  const klar = () => { const t = textRef.current; onKlar(t === '' ? null : parseInt(t, 10)); };

  useEffect(() => {
    const ned = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); sifra(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); radera(); }
      else if (e.key === 'Enter') { e.preventDefault(); klar(); }
      else if (e.key === 'Escape') { e.preventDefault(); onAvbryt(); }
    };
    window.addEventListener('keydown', ned);
    return () => window.removeEventListener('keydown', ned);
  });

  const klarSparr = useSparr(SPARR_MS);
  const visat = text === '' ? String(varde) : text;
  return (
    <div data-testid="siffer-platta" role="dialog" aria-label={`Skriv m³ för ${namn}`} style={{ padding: `${AVSTAND.l}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m }}>
        <div style={{ minWidth: 0, flex: 1 }}><SortimentNamn namn={namn} /></div>
        <button type="button" data-testid="siffer-avbryt" onClick={onAvbryt}
          style={{ height: TRYCK_PX, padding: `0 ${AVSTAND.l}px`, border: 'none', background: 'transparent', color: FARG.bla, fontFamily: 'inherit', ...TYP.rubrik, cursor: 'pointer', flexShrink: 0 }}>Avbryt</button>
      </div>
      <div data-testid="siffer-visning" data-ersatter={text === '' ? 'ja' : 'nej'}
        style={{ ...TYP.tal, fontSize: 48, textAlign: 'center', ...TNUM, color: text === '' ? FARG.text2 : FARG.text, minHeight: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {visat}<span style={{ ...TYP.listtitel, color: FARG.text2, marginLeft: AVSTAND.s }}>m³</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: AVSTAND.m }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <Tangent key={d} tecken={d} testid={`siffer-${d}`} onTryck={() => sifra(d)} />)}
        <Tangent tecken="⌫" etikett="Radera" testid="siffer-radera" onTryck={radera} />
        <Tangent tecken="0" testid="siffer-0" onTryck={() => sifra('0')} />
        <button type="button" data-testid="siffer-klar" onClick={() => klarSparr(klar)} style={{ ...knappPrimar, height: 64, fontSize: 24, fontWeight: 700 }}>Klar</button>
      </div>
    </div>
  );
}
