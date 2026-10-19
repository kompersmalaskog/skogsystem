'use client';

// BACKVÄG på en väg (markeringsmenyn): en på/av-rad, sedan EN fråga — i vilken ände är hindret — och en valfri orsak. Samma ställe och samma sätt som
// basvägens färgval (BasvagFargVal): en egenskap på vägen, ingen ny vägtyp. Vägens färg ändras aldrig; bara ett tvärstreck (⊣) läggs till i hinderänden.
//
//   Backväg  [på/av]            "Man kör in och måste backa ut"
//   Hindret är i   [Början] [Slutet]    (liten teckning av vägen med strecket i rätt ände)
//   Orsak (valfri) [Sten] [Brant] [Blött] [Annat]     (EN åt gången, tryck igen för att ta bort; inget fritextfält)
//
// På → hindret förvalt i slutet (BACKVAG_FORVALD_ANDE); strecket syns genast på kartan bakom och går att flytta med ett tryck.

import React from 'react';
import { AVSTAND, FARG, RADIE, RORELSE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import {
  BACKVAG_ANDAR, BACKVAG_FORVALD_ANDE, BACKVAG_ORSAKER, BACKVAG_TITEL, backvagText,
  type Backvag, type BackvagAnde, type BackvagOrsak,
} from '@/lib/backvag';

/** Vägen som en kort vågrät linje med tvärstrecket i den ände som väljs (start = vänster, slut = höger). */
function VagTeckning({ ande }: { ande: BackvagAnde }) {
  const x = ande === 'start' ? 4 : 36;
  return (
    <svg aria-hidden="true" width={40} height={16} viewBox="0 0 40 16" style={{ flexShrink: 0 }}>
      <line x1={4} y1={8} x2={36} y2={8} stroke="currentColor" strokeWidth={3} strokeLinecap="round" opacity={0.55} />
      <line x1={x} y1={1.5} x2={x} y2={14.5} stroke="currentColor" strokeWidth={4.5} strokeLinecap="round" />
    </svg>
  );
}

const valKnapp = (vald: boolean): React.CSSProperties => ({
  minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.s,
  borderRadius: RADIE.rad, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: FARG.fyllning, color: FARG.text, ...TYP.text,
  fontWeight: vald ? 700 : 400, boxShadow: vald ? `inset 0 0 0 ${AVSTAND.xs / 2}px ${FARG.text}` : 'none',
});

export function BackvagVal({ backvag, onAndra }: { backvag: Backvag | null; onAndra: (bv: Backvag | null) => void }) {
  const pa = backvag != null;
  const sattAnde = (ande: BackvagAnde) => onAndra({ ...(backvag?.orsak ? { orsak: backvag.orsak } : {}), ande });
  const sattOrsak = (orsak: BackvagOrsak) => {
    if (!backvag) return;
    onAndra(backvag.orsak === orsak ? { ande: backvag.ande } : { ande: backvag.ande, orsak });   // tryck igen = ingen orsak
  };
  return (
    <div data-testid="backvag-val" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.min }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...TYP.listtitel, color: FARG.text }}>Backväg</div>
          <div data-testid="backvag-text" style={{ ...TYP.meta, color: FARG.text2 }}>{pa ? backvagText(backvag) : 'Man kör in och måste backa ut'}</div>
        </div>
        {/* Träffytan är 44 px hög (spåret 32 px syns inuti): maskinen skakar och fingret träffar snett. */}
        <button type="button" role="switch" aria-checked={pa} aria-label={BACKVAG_TITEL} data-testid="backvag-brytare"
          onClick={() => onAndra(pa ? null : { ande: BACKVAG_FORVALD_ANDE })}
          style={{ minWidth: TRAFFYTA.primar + AVSTAND.s, minHeight: TRAFFYTA.min, padding: 0, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <span aria-hidden="true" style={{ width: TRAFFYTA.primar + AVSTAND.s, height: AVSTAND.xxl, borderRadius: AVSTAND.xl, position: 'relative', background: pa ? FARG.text : FARG.upphojt, transition: `background ${RORELSE.tryck}ms ${RORELSE.kurva}` }}>
            <span style={{ position: 'absolute', top: AVSTAND.xs, left: pa ? AVSTAND.xl + AVSTAND.xs : AVSTAND.xs, width: AVSTAND.xl, height: AVSTAND.xl, borderRadius: RADIE.cirkel, background: pa ? FARG.bg : FARG.text2, transition: `left ${RORELSE.tryck}ms ${RORELSE.kurva}` }} />
          </span>
        </button>
      </div>

      {backvag && (
        <>
          <div>
            <div style={{ ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.s }}>Hindret är i</div>
            <div role="group" aria-label="Var hindret är" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: AVSTAND.s }}>
              {BACKVAG_ANDAR.map((a) => (
                <button key={a.id} type="button" data-testid={`backvag-ande-${a.id}`} aria-pressed={backvag.ande === a.id} onClick={() => sattAnde(a.id)} style={valKnapp(backvag.ande === a.id)}>
                  <VagTeckning ande={a.id} />{a.namn}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.s }}>Orsak (valfri)</div>
            <div role="group" aria-label="Orsak" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: AVSTAND.s }}>
              {BACKVAG_ORSAKER.map((o) => (
                <button key={o.id} type="button" data-testid={`backvag-orsak-${o.id}`} aria-pressed={backvag.orsak === o.id} onClick={() => sattOrsak(o.id)} style={valKnapp(backvag.orsak === o.id)}>{o.namn}</button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
