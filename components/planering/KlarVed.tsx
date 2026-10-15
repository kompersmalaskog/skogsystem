'use client';

// VEDARKET (tavla 33): vad markägaren ska ha och var det ligger. Öppnas från raden "Ved till markägaren" i kortet och ersätter kortet i samma ram
// (ingen modal ovanpå en modal); ‹ tar tillbaka. Allt sparas direkt vid ett tryck — det finns ingen Spara-knapp att glömma.
//
//   Var       Vid avlägget (förvalt) · Sätt på kartan (en ved-symbol som föraren ser på kartan)
//   Längd     3 m · Fallande · Annan (fritt värde)
//   Sortiment Björk · Allt löv · Energi (flera)
//   Övrigt    fri text
//   Sammanfattning: "Ved: 3 m · Björk · vid avlägget" — samma rad står i kortet och för föraren.

import React from 'react';
import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP, medSafeBotten } from '@/lib/design/tokens';
import { VED_LANGD, VED_SORTIMENT, vedSammanfattning, type VedDetaljer, type VedLangd, type VedSortiment } from '@/lib/klarTrakt';
import { Huvud, Rubrik } from './infoDelar';
import { Val } from './klarDelar';

export interface KlarVedProps {
  namn: string;
  ved: VedDetaljer;
  onAndra: (v: VedDetaljer) => void;
  /** stänger arket och går in i "Tryck där ved ska stå" på kartan */
  onSattPaKartan: () => void;
  onTillbaka: () => void;
  /** "Ingen ved": markägaren ska inte ha ved — stänger vyn och slår av valet */
  onIngenVed: () => void;
  onStang: () => void;
}

export default function KlarVed({ namn, ved, onAndra, onSattPaKartan, onTillbaka, onIngenVed, onStang }: KlarVedProps) {
  const sattPaKartan = ved.plats === 'karta' && !!ved.markeringId;
  const vaxlaSortiment = (id: VedSortiment) =>
    onAndra({ ...ved, sortiment: ved.sortiment.includes(id) ? ved.sortiment.filter((s) => s !== id) : [...ved.sortiment, id] });
  return (
    <>
      <Huvud titel="Ved till markägaren" tillbaka={`Klar med ${namn}?`} onTillbaka={onTillbaka} onStang={onStang} />
      <div data-testid="ved-innehall" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `0 ${AVSTAND.l}px ${AVSTAND.l}px` }}>
        <Rubrik>Var</Rubrik>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: AVSTAND.s, marginBottom: AVSTAND.xs }}>
          <Val testid="ved-plats-avlagg" vald={ved.plats === 'avlagg'} onTryck={() => onAndra({ ...ved, plats: 'avlagg', lat: null, lng: null, markeringId: ved.markeringId })}>Vid avlägget</Val>
          <Val testid="ved-plats-karta" vald={ved.plats === 'karta'} onTryck={() => { if (ved.plats !== 'karta') onAndra({ ...ved, plats: 'karta' }); onSattPaKartan(); }}>Sätt på kartan</Val>
        </div>
        {ved.plats === 'karta' && (
          <div data-testid="ved-karta-status" style={{ ...TYP.meta, color: sattPaKartan ? FARG.gron : FARG.orange, margin: `0 ${AVSTAND.xs}px ${AVSTAND.m}px` }}>
            {sattPaKartan ? 'Ved-symbol satt på kartan — föraren ser den.' : 'Ingen symbol satt än — tryck på Sätt på kartan och peka ut platsen.'}
          </div>
        )}

        <div style={{ height: AVSTAND.l }} />
        <Rubrik>Längd</Rubrik>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: AVSTAND.s }}>
          {VED_LANGD.map((l) => (
            <Val key={l.id} testid={`ved-langd-${l.id}`} vald={ved.langd === l.id} onTryck={() => onAndra({ ...ved, langd: ved.langd === l.id ? null : (l.id as VedLangd) })}>{l.namn}</Val>
          ))}
        </div>
        {ved.langd === 'annan' && (
          <input data-testid="ved-langd-annan-falt" value={ved.langdAnnan} onChange={(e) => onAndra({ ...ved, langdAnnan: e.target.value })} placeholder="Längd, t.ex. 2,5 m" aria-label="Annan längd"
            style={{ width: '100%', boxSizing: 'border-box', marginTop: AVSTAND.s, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px`, borderRadius: RADIE.rad, border: 'none', background: FARG.fyllning, color: FARG.text, fontFamily: 'inherit', outline: 'none', ...TYP.text }} />
        )}

        <div style={{ height: AVSTAND.l }} />
        <Rubrik>Sortiment</Rubrik>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: AVSTAND.s }}>
          {VED_SORTIMENT.map((s) => (
            <Val key={s.id} testid={`ved-sortiment-${s.id}`} vald={ved.sortiment.includes(s.id)} onTryck={() => vaxlaSortiment(s.id)}>{s.namn}</Val>
          ))}
        </div>

        <div style={{ height: AVSTAND.l }} />
        <Rubrik>Övrigt</Rubrik>
        <textarea data-testid="ved-ovrigt" value={ved.ovrigt} onChange={(e) => onAndra({ ...ved, ovrigt: e.target.value })} rows={3} placeholder="T.ex. ska läggas vid ladan" aria-label="Övrigt om veden"
          style={{ width: '100%', boxSizing: 'border-box', padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.rad, border: 'none', background: FARG.fyllning, color: FARG.text, fontFamily: 'inherit', outline: 'none', resize: 'none', ...TYP.text }} />
      </div>
      <div style={{ flexShrink: 0, padding: `${AVSTAND.m}px ${AVSTAND.l}px ${medSafeBotten(AVSTAND.l)}`, borderTop: `1px solid ${FARG.linje}` }}>
        <div data-testid="ved-sammanfattning" style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.s, overflowWrap: 'anywhere' }}>{vedSammanfattning(ved)}</div>
        <button type="button" data-testid="ved-klar" onClick={onTillbaka} className="press-scale" style={{ ...KNAPP.sekundar, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>Klar</button>
        <button type="button" data-testid="ved-ingen" onClick={onIngenVed} className="press-dim"
          style={{ ...KNAPP.tertiar, width: '100%', justifyContent: 'center', marginTop: AVSTAND.xs, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>Ingen ved till markägaren</button>
      </div>
    </>
  );
}
