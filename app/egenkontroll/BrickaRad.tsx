'use client';

// RADEN i dockan: vad som är markerat, vad som finns på punkten och svarsknapparna. TRYCK MARKERAR, RADEN SVARAR (lib/egenkontrollBricka.ts).
//
// EN komponent för alla fall — inget särfall för låst runda och inget för "inget markerat". Raden finns ALLTID i dockan:
//   rubrikrad     namn + svar, eller (inget markerat) en rad som säger vad man gör
//   innehållsfält kommentar, typ, planerarens kommentar, avstånd och foton — bara när punkten har något. Växer med innehållet upp till
//                 radens tak (--rad-max, satt av RundArk så att kartan har minst KARTA_MIN_PX kvar; reserv RAD_MAX_DVH) och scrollar därefter
//   knappraden    ALLTID på samma ställe och lika hög: Bra · Godkänt · Bättre · Foto · Not (plan: OK · Avvikelse · Foto · Not)
// Knappraden har fast plats och är avstängd (dämpad) när inget är markerat, rundan är låst eller punkten sparas. Det som kan flytta sig är
// bara texten ovanför knapparna — aldrig något man kan TRYCKA på (se RundArk: arket animerar bara vid lägesbyte).
//
// AVSTEG 7/7 FRÅN PLANERINGSVYN: LÅSTRIGGERN GÖR VYN HELT LÄSBAR NÄR RUNDAN ÄR KLAR — MED AVSTÄNGDA KNAPPAR, INTE UTAN.
// Planeringen har inget läge där allt bara ska läsas: där går allt att ändra tills man tar bort det. En avslutad egenkontroll är ett
// dokument som skickas vidare (rapporten till Vida), och databasen låser den i fyra lager (egenkontroll_punkt_last, egenkontroll_last).
// Vyn visar därför samma rad som på en pågående runda — svar, typ, kommentar och foton — men med knapparna avstängda: det nuvarande svaret
// står intryckt, ingen knapp skriver något. (Först, i #837, togs knapparna bort helt; det gjorde två lägen av en komponent. Martin 2026-10-19:
// samma komponent, knapparna avstängda.) Brickorna går fortfarande att markera — man ska kunna bläddra i dokumentet — men ett tryck skriver aldrig.

import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { AVVIKELSE_ETIKETT, type AvvikelseTyp, type EgenkontrollPunkt, type PunktStatus } from '@/lib/egenkontroll';
import { BRICKSTATUS, FOTO_NOT_ETIKETT, RAD_MAX_DVH, radHandling, radKnappar } from '@/lib/egenkontrollBricka';

/** Textraden ovanför knapparna (rubrikraden) är lika hög med och utan markering, så raden inte ändrar höjd när man markerar. */
const RUBRIK_HOJD = Math.ceil(TYP.listtitel.fontSize * TYP.listtitel.lineHeight);

/** Fotorutorna i radens innehållsfält. Små (typ + en kommentarsrad + foton ska rymmas i fältets tak) men TRYCKBARA: träffytan är 44 px (TRAFFYTA.min) — se FOTO_TRAFF. */
const FOTO_PX = AVSTAND.xxl - AVSTAND.xs;
/** Så långt utanför rutan träffytan sträcker sig (28 + 2 × 8 = 44). Negativ marginal: layouten ser bara rutan på 28, fingret får 44. */
const FOTO_TRAFF = (TRAFFYTA.min - FOTO_PX) / 2;

export const RAD_HJALP_FORSTA = 'Tryck på en bricka ger Bra. Raden ändrar svaret.';
export const RAD_HJALP = 'Tryck på en bricka';
export const RAD_HJALP_LAST = 'Tryck på en bricka för att se svaret';

export type BrickaRadProps = {
  /** Den markerade punkten. Null = inget markerat: raden står kvar med avstängda knappar. */
  punkt: EgenkontrollPunkt | null;
  /** Signerade URL:er för punktens foton. */
  fotoUrler: string[];
  sparar: boolean;
  /** Rundan är avslutad: knapparna är avstängda. */
  last: boolean;
  /** Inget är besvarat än och inget markerat: förklara första trycket. */
  hjalp: boolean;
  /** "42 m" — bara för en planpunkt med position. */
  avstandText?: string | null;
  onSvara: (status: PunktStatus) => void;
  onAvvikelse: () => void;
  onFotoNot: () => void;
  /** Tryck på ett foto i raden (index i `fotoUrler`) öppnar bilden med noteringar (PR 9b). Gäller också en avslutad runda: bilden går att titta på. */
  onOppnaFoto?: (index: number) => void;
};

export default function BrickaRad({ punkt, fotoUrler, sparar, last, hjalp, avstandText, onSvara, onAvvikelse, onFotoNot, onOppnaFoto }: BrickaRadProps) {
  const st = punkt?.status ? BRICKSTATUS[punkt.status] : undefined;
  const knappar = radKnappar(punkt?.del ?? 'utforande');
  const typ = punkt?.avvikelse_typ ? (AVVIKELSE_ETIKETT[punkt.avvikelse_typ as AvvikelseTyp] ?? punkt.avvikelse_typ) : null;
  const harFalt = !!punkt && (!!typ || !!punkt.kommentar || !!punkt.plan_kommentar || !!avstandText || fotoUrler.length > 0);
  const avstangd = !punkt || last || sparar;
  const fotoTryckbara = !!onOppnaFoto && fotoUrler.length > 0;

  return (
    <div
      data-testid="bricka-rad"
      data-tom={punkt ? undefined : '1'}
      data-last={last ? '1' : undefined}
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.s, minWidth: 0, minHeight: RUBRIK_HOJD, paddingBottom: AVSTAND.s }}>
        {punkt ? (
          <>
            <span style={{ ...TYP.listtitel, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{punkt.rubrik}</span>
            <span style={{ ...TYP.micro, flexShrink: 0, color: sparar ? FARG.text2 : st ? FARG[st.farg] : FARG.text2 }}>
              {sparar ? 'Sparar…' : st ? `${st.tecken} ${st.ord}` : 'Kvar'}
            </span>
          </>
        ) : (
          <span role="note" style={{ ...TYP.meta, color: FARG.text2, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {last ? RAD_HJALP_LAST : hjalp ? RAD_HJALP_FORSTA : RAD_HJALP}
          </span>
        )}
      </div>

      {harFalt && punkt && (
        // Innehållsfältet: växer med innehållet upp till --rad-max (RundArk räknar det så att kartan har minst KARTA_MIN_PX kvar; utan RundArk gäller
        // RAD_MAX_DVH) och scrollar därefter. Allt här får flytta sig — inget av det går att trycka på utom att scrolla fältet.
        <div
          data-testid="bricka-rad-innehall"
          data-dock-falt="1"
          tabIndex={0}
          aria-label="Anteckningar"
          style={{
            boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: AVSTAND.xs,
            // Med tryckbara foton: luft över och till höger så att träffytan (44 px) ligger INNE i fältet, som annars klipper den — och ingen luft under, så att fältets höjd är densamma.
            ...(fotoTryckbara ? { padding: `${FOTO_TRAFF}px ${FOTO_TRAFF}px 0 0` } : { paddingBottom: AVSTAND.xs }),
            maxHeight: `var(--rad-max, ${RAD_MAX_DVH}dvh)`, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* EN rad överst: typen (Körspår, Stubbhöjd …) och avståndet i TEXT till vänster, fotona som små rutor till höger. Typen fanns i det gamla
              dokumentet per punkt och får inte försvinna. Fotona är små (FOTO_PX) så att typ + en kommentarsrad + foton ryms i fältets tak utan scroll. */}
          {(typ || avstandText || fotoUrler.length > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.s, minHeight: fotoUrler.length > 0 ? FOTO_PX : undefined }}>
              <span style={{ ...TYP.meta, color: FARG.text2, minWidth: 0 }}>{[typ, avstandText].filter(Boolean).join(' · ')}</span>
              {fotoUrler.length > 0 && (
                <span style={{ display: 'flex', gap: fotoTryckbara ? AVSTAND.l : AVSTAND.xs, flexShrink: 0 }}>
                  {fotoUrler.map((url, i) => {
                    // Fast storlek: en bild som laddar ändrar aldrig fältets höjd.
                    // eslint-disable-next-line @next/next/no-img-element
                    const bild = <img src={url} alt="" width={FOTO_PX} height={FOTO_PX} style={{ width: FOTO_PX, height: FOTO_PX, borderRadius: RADIE.rad, objectFit: 'cover', display: 'block' }} />;
                    if (!onOppnaFoto) return <span key={url}>{bild}</span>;
                    return (
                      <button
                        key={url}
                        type="button"
                        data-foto-index={i}
                        aria-label={`Öppna foto ${i + 1} av ${fotoUrler.length}`}
                        onClick={() => onOppnaFoto(i)}
                        // Träffytan 44 px runt en ruta på 28: padding + lika stor negativ marginal, så layouten inte ändras.
                        style={{ padding: FOTO_TRAFF, margin: -FOTO_TRAFF, border: 'none', background: 'none', cursor: 'pointer', display: 'block', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                      >
                        {bild}
                      </button>
                    );
                  })}
                </span>
              )}
            </div>
          )}
          {punkt.kommentar && <div style={{ ...TYP.meta, color: FARG.text2, overflowWrap: 'anywhere' }}>{punkt.kommentar}</div>}
          {punkt.plan_kommentar && <div style={{ ...TYP.meta, color: FARG.text2, overflowWrap: 'anywhere' }}>{punkt.plan_kommentar}</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: AVSTAND.s }}>
        {knappar.map((k) => {
          const aktiv = punkt?.status === k.status;
          return (
            <button
              key={k.status}
              type="button"
              disabled={avstangd}
              aria-pressed={aktiv}
              data-svar={k.status}
              onClick={() => {
                const h = radHandling(k.status, last);
                if (h === 'svara') onSvara(k.status);
                else if (h === 'avvikelse-ark') onAvvikelse();
              }}
              style={{
                ...KNAPP.sekundar, flex: 1, minWidth: 0, minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.xs}px`,
                ...(aktiv ? { background: FARG.text, color: FARG.bg } : {}),
                // Avstängd = dämpad. Det nuvarande svaret på en låst runda står kvar tydligt (det ÄR svaret); allt annat dämpas.
                opacity: avstangd && !(last && aktiv) ? 0.4 : 1, whiteSpace: 'nowrap',
              }}
            >
              {k.etikett}
            </button>
          );
        })}
        <button
          type="button"
          disabled={avstangd}
          data-svar="foto-not"
          onClick={onFotoNot}
          style={{
            ...KNAPP.sekundar, flex: 1.3, minWidth: 0, minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.xs}px`,
            opacity: avstangd ? 0.4 : 1, whiteSpace: 'nowrap',
          }}
        >
          {FOTO_NOT_ETIKETT}
        </button>
      </div>
    </div>
  );
}
