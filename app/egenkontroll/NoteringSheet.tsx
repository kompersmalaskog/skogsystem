'use client';

// En notering: ORD på kartan. Texten, och om det är "så här blev det" eller "så här skulle det gjorts".
//
// TVÅ LÄGEN, ett formulär: 'ny' (efter att man ritat — platsen är redan satt) och 'andra' (tryck på en notering på kartan).
// En avsikt, ett fält: två knappar bredvid varandra, aldrig två verktyg. "Så här blev det" är förvald.
//
// TOM TEXT = BORTTAGEN (Martin 2026-10-21). I 'andra' blir den stora knappen röd och heter "Ta bort" så fort texten är tom — ett enda sätt att
// ta bort en notering, och inga felmeddelande om att en tom etikett inte får sparas. Under huvudet gör appen en DELETE, aldrig en UPDATE:
// databasen avvisar en tom etikett (andraNotering i lib/egenkontroll.ts). I 'ny' är Klar grå tills det står något.
//
// MISSLYCKAS SPARNINGEN stängs arket aldrig: texten ligger kvar och "Försök igen" skriver SAMMA rad (id:t skapas en gång per öppning).

import { useRef, useState } from 'react';
import Ark from '@/components/design/Ark';
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TYP, VIKT } from '@/lib/design/tokens';
import { andraNotering, skapaNotering, type NoteringInmatning } from '@/lib/egenkontroll';
import { nyttPunktId } from '@/lib/egenkontrollObservation';
import {
  AVSIKT_ETIKETT, AVSIKT_STANDARD, NOTERING_ETIKETT_MAX, arTomEtikett, rensaEtikett, type Notering, type NoteringAvsikt, type NoteringVerktyg,
} from '@/lib/egenkontrollNotering';

const AVSIKTER: NoteringAvsikt[] = ['blev', 'skulle'];

export type NoteringSheetProps =
  | { lage: 'ny'; egenkontrollId: string; verktyg: NoteringVerktyg; koordinater: [number, number][]; onStang: () => void; onSparad: () => void }
  | { lage: 'andra'; notering: Notering; onStang: () => void; onSparad: () => void };

export default function NoteringSheet(props: NoteringSheetProps) {
  const arNy = props.lage === 'ny';
  const befintlig = props.lage === 'andra' ? props.notering : null;

  const [text, setText] = useState(befintlig?.etikett ?? '');
  const [avsikt, setAvsikt] = useState<NoteringAvsikt>(befintlig?.avsikt ?? AVSIKT_STANDARD);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  // Ett id per öppning: "Försök igen" efter ett avbrutet svar skriver samma rad, inte en andra.
  const idRef = useRef<string>(nyttPunktId());

  const tom = arTomEtikett(text);
  const andrad = befintlig ? rensaEtikett(text) !== befintlig.etikett || avsikt !== befintlig.avsikt : true;
  // 'andra' + tom text = ta bort (en DELETE). 'ny' + tom text = inget att spara.
  const taBort = !arNy && tom;
  const kanKlicka = !sparar && (arNy ? !tom : taBort || (andrad && !tom));

  const klar = async () => {
    if (!kanKlicka) return;
    setSparar(true);
    setFel(null);
    try {
      if (props.lage === 'ny') {
        const i: NoteringInmatning = {
          id: idRef.current, egenkontrollId: props.egenkontrollId, verktyg: props.verktyg, etikett: text, avsikt, koordinater: props.koordinater,
        };
        await skapaNotering(i);
      } else {
        await andraNotering(props.notering.id, { etikett: text, avsikt });
      }
      props.onSparad();
    } catch (e) {
      setFel(e instanceof Error ? e.message : 'Kunde inte spara noteringen.');
    } finally {
      setSparar(false);
    }
  };

  const knapptext = sparar ? (taBort ? 'Tar bort…' : 'Sparar…') : taBort ? 'Ta bort' : 'Klar';

  return (
    <Ark
      rubrik={arNy ? 'Ny notering' : 'Notering'}
      onStang={props.onStang}
      fot={(
        <button
          type="button"
          onClick={klar}
          disabled={!kanKlicka}
          style={{ ...(taBort ? KNAPP.destruktiv : KNAPP.primar), ...(kanKlicka ? null : INAKTIV) }}
        >
          {knapptext}
        </button>
      )}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, NOTERING_ETIKETT_MAX))}
        placeholder="Vad vill du säga? T.ex. Stenmur."
        aria-label="Text på kartan"
        autoFocus={arNy}
        rows={2}
        style={{
          width: '100%', minHeight: 88, boxSizing: 'border-box', resize: 'none', borderRadius: RADIE.rad, border: 'none',
          background: FARG.upphojt, color: FARG.text, ...TYP.text, fontFamily: 'inherit', padding: AVSTAND.m,
        }}
      />
      {!arNy && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Töm texten för att ta bort noteringen.</p>}

      <div role="group" aria-label="Vad beskriver noteringen?" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: AVSTAND.s, marginTop: AVSTAND.l }}>
        {AVSIKTER.map((a) => {
          const vald = avsikt === a;
          return (
            <button
              key={a}
              type="button"
              onClick={() => setAvsikt(a)}
              aria-pressed={vald}
              style={{
                minHeight: 56, borderRadius: RADIE.knapp, border: 'none', padding: `0 ${AVSTAND.s}px`,
                background: vald ? FARG.text : FARG.fyllning, color: vald ? FARG.bg : FARG.text,
                ...TYP.meta, fontWeight: VIKT.halvfet, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              {AVSIKT_ETIKETT[a]}
            </button>
          );
        })}
      </div>

      {fel && (
        <div role="alert" style={{ marginTop: AVSTAND.l, background: FARG.upphojt, border: `1px solid ${FARG.rod}`, borderRadius: RADIE.rad, padding: AVSTAND.m, ...TYP.meta, color: FARG.text }}>
          <div>{fel}</div>
          <div style={{ color: FARG.text2, marginTop: AVSTAND.xs }}>Inget är förlorat — det du skrivit ligger kvar.</div>
        </div>
      )}
    </Ark>
  );
}
