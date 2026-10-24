'use client';

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import { AVSTAND, FARG, INAKTIV, KNAPP, TNUM, TYP } from '@/lib/design/tokens';
import { fmtTid, type TidForslag } from '@/lib/flytt/traillertid';
import { fmtKlocka } from './nu';
import type { Skrivsvar } from './godkann';

const STEG: { text: string; min: number }[] = [
  { text: '−1 h', min: -60 }, { text: '−15 min', min: -15 }, { text: '+15 min', min: 15 }, { text: '+1 h', min: 60 },
];

/**
 * "Tid att fakturera" — tiden för en flytt över 3 mil, så att ett barn förstår den:
 *   det stora talet är tiden ("3 h 49 min", aldrig decimaler), under det VAR den kommer ifrån i ord
 *   ("Från 11:09 – förra maskinen var lossad", "Till 14:57 – bilen var tillbaka"), och fyra knappar för att
 *   ändra den (±15 min, ±1 h). Spara står i foten med tiden på knappen. Appens förslag går alltid att ta tillbaka.
 * Går tiden inte att räkna sägs varför, och man ställer in den själv (aldrig ett påhittat tal).
 * En fakturerad flytt går bara att läsa.
 */
export default function TidArk({ maskin, forslag, sparadMin, last, onSpara, onStang }: {
  maskin: string;
  /** null = läsfel (rundan kunde inte läsas). */
  forslag: TidForslag | null;
  sparadMin: number | null;
  /** Fakturerad: bara läsa. */
  last: boolean;
  onSpara: (min: number) => Promise<Skrivsvar>;
  onStang: () => void;
}) {
  const forslagMin = forslag?.lage === 'ok' ? forslag.min : null;
  const [min, setMin] = useState<number>(sparadMin ?? forslagMin ?? 0);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const kanSpara = !last && !sparar && min > 0 && min !== sparadMin;
  async function spara() {
    if (!kanSpara) return;
    setSparar(true); setFel(null);
    const svar = await onSpara(min);
    setSparar(false);
    if (!svar.ok) setFel(`Kunde inte spara tiden: ${svar.fel}`);
  }

  return (
    <Ark rubrik="Tid att fakturera" onStang={onStang} stang={last ? 'Klar' : 'Avbryt'}
      fot={last ? undefined : (
        <button type="button" data-tid-spara onClick={spara} disabled={!kanSpara} style={{ ...KNAPP.primar, ...(kanSpara ? {} : INAKTIV) }}>
          {sparar ? 'Sparar …' : min > 0 ? `Spara ${fmtTid(min)}` : 'Ställ in tiden'}
        </button>
      )}>
      <div style={{ ...TYP.meta, color: FARG.text2 }}>{maskin}</div>
      <div data-tid-tal style={{ ...TYP.tal, ...TNUM, color: FARG.text, margin: `${AVSTAND.xs}px 0 ${AVSTAND.m}px` }}>{min > 0 ? fmtTid(min) : 'Ingen tid'}</div>

      {forslag?.lage === 'ok' && (
        <div data-tid-varifran style={{ ...TYP.text, ...TNUM, color: FARG.text2, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          <span>Från {fmtKlocka(forslag.fran)} – {forslag.forst ? 'bilen åkte' : 'förra maskinen var lossad'}</span>
          <span>Till {fmtKlocka(forslag.till)} – {forslag.medHem ? 'bilen var tillbaka' : 'maskinen var lossad'}</span>
        </div>
      )}
      {forslag?.lage === 'ok' && forslag.varning && (
        <p data-tid-varning style={{ ...TYP.meta, color: FARG.orange, margin: `${AVSTAND.s}px 0 0` }}>{forslag.varning}</p>
      )}
      {forslag?.lage === 'saknas' && (
        <p data-tid-saknas style={{ ...TYP.text, color: FARG.orange, margin: 0 }}>Appen kan inte räkna tiden: {forslag.orsak.toLowerCase()}. Ställ in den själv.</p>
      )}
      {forslag === null && (
        <p role="alert" style={{ ...TYP.text, color: FARG.orange, margin: 0 }}>Kunde inte läsa rundan. Ställ in tiden själv.</p>
      )}

      {last ? (
        <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.l}px 0 0` }}>Fakturerad – går inte att ändra.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: AVSTAND.s, marginTop: AVSTAND.l }}>
            {STEG.map(s => {
              const kan = min + s.min > 0;
              return (
                <button key={s.text} type="button" onClick={() => kan && setMin(min + s.min)} disabled={!kan}
                  style={{ ...KNAPP.sekundar, padding: 0, ...(kan ? {} : INAKTIV) }}>{s.text}</button>
              );
            })}
          </div>
          {forslagMin != null && min !== forslagMin && (
            <button type="button" data-tid-forslag onClick={() => setMin(forslagMin)} style={{ ...KNAPP.lank, marginTop: AVSTAND.m }}>
              Tillbaka till appens förslag ({fmtTid(forslagMin)})
            </button>
          )}
        </>
      )}
      {fel && <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: `${AVSTAND.m}px 0 0` }}>{fel}</p>}
    </Ark>
  );
}
