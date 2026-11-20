'use client';

import { useEffect, useState } from 'react';
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
 *
 * Knappen säger alltid VARFÖR den inte går att trycka (Martin 2026-11-05: "knappen var nersläckt hela tiden"):
 * tiden som står är redan sparad → "Sparad 4 h 13 min"; förslaget läses → "Läser förslaget …". Kommer förslaget efter
 * att arket öppnats fylls det i, så länge man inte själv rört tiden.
 */
export default function TidArk({ maskin, forslag, sparadMin, last, onSpara, onStang, steg, sparaText, onHoppaOver }: {
  maskin: string;
  /** null = läsfel (rundan kunde inte läsas), undefined = läses. */
  forslag: TidForslag | null | undefined;
  sparadMin: number | null;
  /** Fakturerad: bara läsa. */
  last: boolean;
  onSpara: (min: number) => Promise<Skrivsvar>;
  onStang: () => void;
  /** I genomgången: "2 av 5" överst, knappen säger "Spara och nästa", och "Hoppa över" finns. */
  steg?: string;
  sparaText?: string;
  onHoppaOver?: () => void;
}) {
  const forslagMin = forslag?.lage === 'ok' ? forslag.min : null;
  const [min, setMinRa] = useState<number>(sparadMin ?? forslagMin ?? 0);
  const [rord, setRord] = useState(false);
  const setMin = (m: number) => { setRord(true); setMinRa(m); };
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  // Förslaget kom efter att arket öppnades: fyll i det, om man inte redan ställt in tiden själv.
  useEffect(() => {
    if (!rord && sparadMin == null && forslagMin != null) setMinRa(forslagMin);
  }, [forslagMin, sparadMin, rord]);

  const redanSparad = sparadMin != null && min === sparadMin;
  const laser = forslag === undefined && sparadMin == null && !rord;
  const kanSpara = !last && !sparar && min > 0 && !redanSparad;
  const knappText = sparar ? 'Sparar …'
    : redanSparad ? `Sparad ${fmtTid(min)}`
    : laser ? 'Läser förslaget …'
    : min > 0 ? (sparaText ?? `Spara ${fmtTid(min)}`) : 'Ställ in tiden';
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
          {redanSparad && !sparar && <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 'inherit', verticalAlign: 'middle', marginRight: AVSTAND.xs }}>check</span>}
          {knappText}
        </button>
      )}>
      {steg && <div data-steg style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>{steg}</div>}
      <div style={{ ...TYP.meta, color: FARG.text2 }}>{maskin}</div>
      <div data-tid-tal style={{ ...TYP.tal, ...TNUM, color: FARG.text, margin: `${AVSTAND.xs}px 0 ${AVSTAND.m}px` }}>{min > 0 ? fmtTid(min) : laser ? 'Läser …' : 'Ingen tid'}</div>
      {redanSparad && !last && (
        <p data-tid-sparad style={{ ...TYP.meta, color: FARG.text2, margin: `-${AVSTAND.s}px 0 ${AVSTAND.m}px` }}>Den här tiden är sparad och faktureras. Ändra den med knapparna för att spara en annan.</p>
      )}

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
      {onHoppaOver && (
        <button type="button" data-hoppa-over onClick={onHoppaOver} style={{ ...KNAPP.lank, display: 'block', margin: `${AVSTAND.l}px auto 0` }}>Hoppa över</button>
      )}
    </Ark>
  );
}
