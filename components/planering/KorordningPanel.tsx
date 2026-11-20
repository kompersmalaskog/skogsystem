'use client';

// KÖRORDNING — planerarens lista (skiss 50–51). Står nertill medan läget är på och kartan är fri att trycka på: tryck vägarna i den ordning de ska köras → 1, 2, 3.
// Listan: siffra, vägfärg, namn, längd. Börja om / Klar. Finns gamla körriktningspilar på trakten (och ingen ordning är satt) föreslår appen en ordning ur dem; planeraren
// godkänner med ETT tryck, och först då tas de pilar bort som förslaget bygger på. Allt via designtokens.
import React from 'react';
import { AVSTAND, FARG, RADIE, TYP, TNUM, medSafeBotten } from '@/lib/design/tokens';

export interface KorRad { id: string; ordning: number; farg: string; namn: string; langd: string }

const PLUS_OVER_PX = 20 + 44 + AVSTAND.s;       // samma plats som KorvyNertillList: ovanför plusknappen på telefon
const PLUS_ZON_PX = 72;                          // …och bredvid den på bred skärm

function Rader({ rader }: { rader: readonly KorRad[] }) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: '28dvh' }}>
      {rader.map((r) => (
        <li key={r.id} data-testid={`kor-rad-${r.id}`} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: 44, padding: `0 ${AVSTAND.s}px` }}>
          <span style={{ width: 28, textAlign: 'center', ...TYP.listtitel, ...TNUM }}>{r.ordning}</span>
          <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: RADIE.cirkel, background: r.farg, border: `1px solid ${FARG.linje}`, flexShrink: 0 }} />
          <span style={{ flex: '1 1 auto', minWidth: 0, ...TYP.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.namn}</span>
          <span style={{ ...TYP.meta, color: FARG.text2, ...TNUM }}>{r.langd}</span>
        </li>
      ))}
    </ol>
  );
}

const knapp = (primar: boolean, gron = false): React.CSSProperties => ({
  flex: '1 1 0', minWidth: 0, height: 48, padding: `0 ${AVSTAND.m}px`, border: 'none', borderRadius: RADIE.knapp, fontFamily: 'inherit', ...TYP.listtitel, cursor: 'pointer',
  background: gron ? FARG.gron : primar ? FARG.text : FARG.fyllning, color: gron || primar ? FARG.bg : FARG.text,
});

export function KorordningPanel({ rader, forslag, smal, onKlar, onBorjaOm, onGodkann, onInteNu }: {
  rader: readonly KorRad[];
  /** Appens förslag ur de gamla körriktningspilarna (bara när ingen ordning är satt). `pilar` = antal pilar förslaget bygger på. */
  forslag: { rader: readonly KorRad[]; pilar: number } | null;
  smal: boolean;
  onKlar: () => void;
  onBorjaOm: () => void;
  onGodkann: () => void;
  onInteNu: () => void;
}) {
  return (
    <div
      data-testid="korordning-panel"
      style={{ position: 'fixed', left: AVSTAND.s, right: smal ? AVSTAND.s : PLUS_ZON_PX, zIndex: 600, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        bottom: smal ? `calc(${PLUS_OVER_PX}px + env(safe-area-inset-bottom, 0px))` : medSafeBotten(AVSTAND.l + AVSTAND.xs) }}
    >
      <div role="status" style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: AVSTAND.s, width: '100%', maxWidth: 560, boxSizing: 'border-box', padding: AVSTAND.s,
        background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet, color: FARG.text, fontFamily: 'inherit' }}>
        <div style={{ padding: `${AVSTAND.xs}px ${AVSTAND.s}px 0`, ...TYP.listtitel }}>
          {forslag ? `Förslag ur dina körriktningspilar · ${forslag.rader.length} ${forslag.rader.length === 1 ? 'väg' : 'vägar'}`
            : rader.length === 0 ? 'Körordning · tryck på vägarna i den ordning de ska köras'
            : 'Körordning · tryck på en vägs ände för att vända den'}
        </div>
        {forslag ? (
          <>
            <Rader rader={forslag.rader} />
            <div style={{ padding: `0 ${AVSTAND.s}px`, ...TYP.meta, color: FARG.text2 }}>Ordningen är en gissning (pilarna visar riktning, inte ordning) — rätta efteråt. De {forslag.pilar} pilarna tas bort först när du godkänner.</div>
            <div style={{ display: 'flex', gap: AVSTAND.s }}>
              <button type="button" data-testid="kor-inte-nu" onClick={onInteNu} className="press-dim" style={knapp(false)}>Inte nu</button>
              <button type="button" data-testid="kor-godkann" onClick={onGodkann} className="press-dim" style={{ ...knapp(true), flex: '1.4 1 0' }}>Godkänn</button>
            </div>
          </>
        ) : (
          <>
            {rader.length > 0 && <Rader rader={rader} />}
            <div style={{ display: 'flex', gap: AVSTAND.s }}>
              <button type="button" data-testid="kor-borja-om" onClick={onBorjaOm} disabled={rader.length === 0} className="press-dim" style={{ ...knapp(false), opacity: rader.length === 0 ? 0.4 : 1 }}>Börja om</button>
              <button type="button" data-testid="kor-klar" onClick={onKlar} className="press-dim" style={{ ...knapp(true, true), flex: '1.4 1 0' }}>Klar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
