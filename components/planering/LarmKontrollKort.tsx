'use client';
// "Du är vid larmplatsen — kommer en ambulans hit?" (lib/larmKontroll). Kommer en gång per larmplats när man står inom 50 m
// från en som ingen bekräftat — i maskinen och för planeraren ute med telefonen. Larm, lossning, besök, risker och instruktioner
// går före. Ja = kontrollerad. Nej = en kort rad om varför (valfri) och planeraren får en push. × = inte nu (frågar inte igen här).

import React, { useState } from 'react';
import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';

export default function LarmKontrollKort({ namn, top, sparar, fel, onJa, onNej, onInteNu }: {
  namn: string | null; top: string; sparar: boolean; fel: boolean;
  onJa: () => void; onNej: (kommentar: string) => void; onInteNu: () => void;
}) {
  const [nej, setNej] = useState(false);
  const [text, setText] = useState('');
  return (
    <div style={{ position: 'fixed', left: AVSTAND.m, right: AVSTAND.m, top, zIndex: 610, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div role="dialog" aria-label="Kontrollera larmplatsen" data-testid="larm-kontroll-kort"
        style={{ width: '100%', maxWidth: 560, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px`,
          background: FARG.kort, borderRadius: RADIE.sheet, color: FARG.text, pointerEvents: 'auto', boxShadow: '0 16px 50px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: AVSTAND.m }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TYP.meta, color: FARG.text2 }}>Du är vid larmplatsen{namn ? ` · ${namn}` : ''}</div>
            <div style={{ ...TYP.rubrik, marginTop: AVSTAND.xs }}>{nej ? 'Varför inte?' : 'Kommer en ambulans hit?'}</div>
          </div>
          <button type="button" data-testid="larm-kontroll-inte-nu" onClick={onInteNu} aria-label="Inte nu"
            style={{ width: TRAFFYTA.min, height: TRAFFYTA.min, flexShrink: 0, background: 'transparent', border: 'none', color: FARG.text2, ...TYP.rubrik, cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
        </div>
        {nej ? (
          <>
            <input data-testid="larm-kontroll-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={280} placeholder="T.ex. bommen är låst"
              style={{ ...TYP.text, minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.m}px`, borderRadius: RADIE.knapp, border: `1px solid ${FARG.linje}`, background: FARG.upphojt, color: FARG.text, fontFamily: 'inherit' }} />
            <button type="button" data-testid="larm-kontroll-skicka" disabled={sparar} onClick={() => onNej(text)} style={{ ...KNAPP.primar, minHeight: TRAFFYTA.primar }}>
              {sparar ? 'Sparar …' : 'Skicka till planeraren'}
            </button>
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: AVSTAND.s }}>
            <button type="button" data-testid="larm-kontroll-ja" disabled={sparar} onClick={onJa} style={{ ...KNAPP.primar, minHeight: TRAFFYTA.primar }}>Ja</button>
            <button type="button" data-testid="larm-kontroll-nej" disabled={sparar} onClick={() => setNej(true)} style={{ ...KNAPP.sekundar, minHeight: TRAFFYTA.primar }}>Nej</button>
          </div>
        )}
        {fel && <div data-testid="larm-kontroll-fel" style={{ ...TYP.meta, color: FARG.orange }}>Kunde inte spara – försök igen när du har täckning.</div>}
      </div>
    </div>
  );
}
