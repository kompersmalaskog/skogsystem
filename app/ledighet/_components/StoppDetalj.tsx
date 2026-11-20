'use client';

import React, { useState } from 'react';
import Ark from '@/components/design/Ark';
import { AVSTAND, FARG, IKON, KNAPP, TNUM, TYP } from '@/lib/design/tokens';
import { fmtPeriod } from './datum';
import { FelText, KORT_TEXTKNAPP } from './delar';
import Ikon from '@/components/design/Ikon';
import type { SchemaMaskin, SchemaStopp } from './useSchemaData';

const ORSAK_ORD: Record<string, string> = {
  semesterstopp: 'Semesterstopp',
  produktionsbegransning: 'Produktionsbegränsning',
};

/**
 * Ett maskinstopp i Schema, öppnat med ETT tryck på blocket (godkännare). Förr tog ett tryck på ett 20 px
 * högt block bort stoppet direkt (efter en webbläsardialog) — 20 px går inte att träffa med finger i en
 * maskin. Nu öppnar trycket det här arket: stoppet står i ord, och Ta bort är en egen, tydlig handling
 * med bekräftelse på plats ("Nej / Ja, ta bort"). Själva borttagningen (`onTaBort`) ägs av SchemaVy, orörd.
 */
export default function StoppDetalj({
  stopp, maskiner, fel, onStang, onTaBort,
}: {
  stopp: SchemaStopp;
  maskiner: SchemaMaskin[];
  fel: string | null;
  onStang: () => void;
  onTaBort: () => void;
}) {
  const [bekrafta, setBekrafta] = useState(false);
  const namn = stopp.maskin_ids.map(id => maskiner.find(m => m.maskin_id === id)?.namn ?? id);
  const antal = stopp.maskin_ids.length;
  const rad = (etikett: string, varde: string) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: AVSTAND.m, padding: `${AVSTAND.m}px 0`, borderBottom: `1px solid ${FARG.linje}` }}>
      <span style={{ ...TYP.meta, color: FARG.text2, flexShrink: 0 }}>{etikett}</span>
      <span style={{ ...TYP.listtitel, ...TNUM, color: FARG.text, textAlign: 'right' }}>{varde}</span>
    </div>
  );

  return (
    <Ark
      rubrik="Maskinstopp"
      onStang={onStang}
      fot={
        <>
          <FelText text={fel} />
          {bekrafta ? (
            <div className="tona-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.s }}>
              <span style={{ ...TYP.meta, color: FARG.text2 }}>
                Ta bort stoppet {fmtPeriod(stopp.fran_datum, stopp.till_datum)}? Det gäller {antal} maskin{antal === 1 ? '' : 'er'}.
              </span>
              <div style={{ display: 'flex', gap: AVSTAND.l, flexShrink: 0 }}>
                <button onClick={() => setBekrafta(false)} style={{ ...KNAPP.tertiar, ...KORT_TEXTKNAPP, ...TYP.text, color: FARG.text }}>Nej</button>
                <button onClick={() => { setBekrafta(false); onTaBort(); }} style={KNAPP.destruktiv}>Ja, ta bort</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setBekrafta(true)} style={{ ...KNAPP.destruktiv, width: '100%', justifyContent: 'center' }}>
              <Ikon namn="delete" storlek={IKON.text} farg="inherit" />Ta bort stopp
            </button>
          )}
        </>
      }
    >
      {rad('Period', fmtPeriod(stopp.fran_datum, stopp.till_datum))}
      {rad('Orsak', ORSAK_ORD[stopp.orsak] ?? stopp.orsak)}
      {rad(antal === 1 ? 'Maskin' : 'Maskiner', namn.join(', '))}
      {stopp.kommentar && rad('Kommentar', stopp.kommentar)}
    </Ark>
  );
}
