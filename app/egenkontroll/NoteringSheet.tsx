'use client';

// En notering: ORD på kartan eller ett foto. Texten, och om det är "så här blev det" eller "så här skulle det gjorts".
//
// TVÅ LÄGEN, ett formulär: 'ny' (efter att man ritat — platsen är redan satt) och 'andra' (tryck på en notering på kartan eller bilden).
// PÅ ETT FOTO (9b) är texten förifylld med punktens namn ("Kulturlämning") och går att ändra; etikettens plats på bilden räknas av fotoytan
// (`foto.forskjutning`, `forskjutning`) — arket vet inget om geometri, det skickar bara med det ytan ger.
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
import { andraNotering, skapaNotering, type NoteringForskjutning, type NoteringInmatning } from '@/lib/egenkontroll';
import { nyttPunktId } from '@/lib/egenkontrollObservation';
import {
  AVSIKT_ETIKETT, AVSIKT_STANDARD, NOTERING_ETIKETT_MAX, arTomEtikett, rensaEtikett, type Notering, type NoteringAvsikt, type NoteringVerktyg,
} from '@/lib/egenkontrollNotering';
import { FOTO_ETIKETT_PDF_ANDEL, fotoEtikettMatt } from '@/lib/egenkontrollFotoEtikett';

const AVSIKTER: NoteringAvsikt[] = ['blev', 'skulle'];

const fotoInmatning = (fotoId: string, p: FotoPlats): NonNullable<NoteringInmatning['foto']> => ({ fotoId, bildHojd: p.bildHojd, dx: p.dx, dy: p.dy, ruta: p.ruta });

/** Etikettens plats på bilden för en given text: det fotoytan räknat ut (ankare u/v, förskjutning klämd mot SKÄRMENS ruta, rutan). */
export type FotoPlats = NoteringForskjutning;

export type NoteringSheetProps =
  | {
    lage: 'ny'; egenkontrollId: string; verktyg: NoteringVerktyg; koordinater: [number, number][]; onStang: () => void; onSparad: () => void;
    /** Ett foto (9b): noteringen sparas på bilden, med etikettens plats ur `plats(text)`. Utelämnat = en notering på kartan. */
    foto?: { fotoId: string; plats: (etikett: string) => FotoPlats };
    /** Förifylld text (punktens namn på ett foto). Går att ändra. */
    startText?: string;
  }
  | {
    lage: 'andra'; notering: Notering; onStang: () => void; onSparad: () => void;
    /** Ett foto: etikettens plats för den nya texten (en annan text är en annan ruta), klämd mot ytan. */
    plats?: (etikett: string) => FotoPlats;
  };

export default function NoteringSheet(props: NoteringSheetProps) {
  const arNy = props.lage === 'ny';
  const befintlig = props.lage === 'andra' ? props.notering : null;

  const paFoto = props.lage === 'ny' ? !!props.foto : befintlig?.underlag === 'foto';
  const [text, setText] = useState(befintlig?.etikett ?? (props.lage === 'ny' ? props.startText ?? '' : ''));
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
          ...(props.foto ? { foto: fotoInmatning(props.foto.fotoId, props.foto.plats(rensaEtikett(text))) } : {}),
        };
        await skapaNotering(i);
      } else {
        // En ny text är en ny ruta: på ett foto räknas platsen om och klämms mot bilden (samma funktion som renderar).
        const p = props.plats && !arTomEtikett(text) ? props.plats(rensaEtikett(text)) : null;
        await andraNotering(props.notering.id, {
          etikett: text, avsikt,
          ...(p ? { forskjutning: p } : {}),
        });
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
        aria-label={paFoto ? 'Text på bilden' : 'Text på kartan'}
        autoFocus={arNy}
        rows={2}
        style={{
          width: '100%', minHeight: 88, boxSizing: 'border-box', resize: 'none', borderRadius: RADIE.rad, border: 'none',
          background: FARG.upphojt, color: FARG.text, ...TYP.text, fontFamily: 'inherit', padding: AVSTAND.m,
        }}
      />
      {!arNy && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Töm texten för att ta bort noteringen.</p>}
      {paFoto && fotoEtikettMatt(text, FOTO_ETIKETT_PDF_ANDEL)?.avkortad && (
        <p data-testid="notering-avkortad-info" style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Texten kortas på bilden. Hela texten sparas.</p>
      )}

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

      {avsikt === 'skulle' && (
        <p data-testid="notering-skulle-info" style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Följer inte med i rapporten till Vida.</p>
      )}

      {fel && (
        <div role="alert" style={{ marginTop: AVSTAND.l, background: FARG.upphojt, border: `1px solid ${FARG.rod}`, borderRadius: RADIE.rad, padding: AVSTAND.m, ...TYP.meta, color: FARG.text }}>
          <div>{fel}</div>
          <div style={{ color: FARG.text2, marginTop: AVSTAND.xs }}>Inget är förlorat — det du skrivit ligger kvar.</div>
        </div>
      )}
    </Ark>
  );
}
