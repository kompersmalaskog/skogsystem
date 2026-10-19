'use client';

// RADEN under brickorna: vad som är markerat och svarsknapparna. TRYCK MARKERAR, RADEN SVARAR (lib/egenkontrollBricka.ts).
//
// Utförande: Bra · Godkänt · Bättre · Foto · Not. Plan (en markerad punkt på kartan): OK · Avvikelse · Foto · Not.
// Knappen med det nuvarande svaret är fylld (vit, svart text); ett tryck på en annan knapp ändrar svaret, ett tryck på den fyllda gör
// ingenting (svara() skriver aldrig samma svar igen). Avvikelse skrivs aldrig rakt av — den behöver typ, foto och position och öppnar formuläret.

import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { AVVIKELSE_ETIKETT, type AvvikelseTyp, type EgenkontrollPunkt, type PunktStatus } from '@/lib/egenkontroll';
import { BRICKSTATUS, FOTO_NOT_ETIKETT, radHandling, radKnappar } from '@/lib/egenkontrollBricka';

export type BrickaRadProps = {
  punkt: EgenkontrollPunkt;
  /** Signerade URL:er för punktens foton — visas bara på en avslutad runda (dokumentet), i dockan tar de för mycket plats. */
  fotoUrler: string[];
  sparar: boolean;
  /** Rundan är avslutad. */
  last: boolean;
  /** "42 m" — bara för en planpunkt med position. */
  avstandText?: string | null;
  onSvara: (status: PunktStatus) => void;
  onAvvikelse: () => void;
  onFotoNot: () => void;
};

export default function BrickaRad({ punkt, fotoUrler, sparar, last, avstandText, onSvara, onAvvikelse, onFotoNot }: BrickaRadProps) {
  const st = punkt.status ? BRICKSTATUS[punkt.status] : undefined;
  const knappar = radKnappar(punkt.del);
  const hjalp = punkt.kommentar ?? punkt.plan_kommentar;
  const underrad = [avstandText, hjalp].filter(Boolean).join(' · ');

  const rubrikrad = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.s, minWidth: 0 }}>
      <span style={{ ...TYP.listtitel, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{punkt.rubrik}</span>
      <span style={{ ...TYP.micro, flexShrink: 0, color: sparar ? FARG.text2 : st ? FARG[st.farg] : FARG.text2 }}>
        {sparar ? 'Sparar…' : st ? `${st.tecken} ${st.ord}` : 'Kvar'}
      </span>
    </div>
  );

  // AVSTEG 7/7 FRÅN PLANERINGSVYN: LÅSTRIGGERN GÖR VYN HELT LÄSBAR NÄR RUNDAN ÄR KLAR.
  // Planeringen har inget läge där allt bara ska läsas: där går allt att ändra tills man tar bort det. En avslutad egenkontroll är ett
  // dokument som skickas vidare (rapporten till Vida), och databasen låser den i fyra lager (egenkontroll_punkt_last, egenkontroll_last).
  // Vyn gör därför inte "en knapp man inte får trycka på" av raden: den visar svar, kommentar och foton som text och bild, helt läsbart,
  // utan en enda svarsknapp. Brickorna går fortfarande att markera — man ska kunna bläddra i dokumentet — men ett tryck skriver aldrig.
  if (last) {
    return (
      <div data-testid="bricka-rad" data-last="1" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
        {rubrikrad}
        {/* Typen (Körspår, Stubbhöjd …) i TEXT — den fanns i det gamla dokumentet per punkt och får inte försvinna med det. */}
        {punkt.avvikelse_typ && (
          <div style={{ ...TYP.meta, color: FARG.text2 }}>{AVVIKELSE_ETIKETT[punkt.avvikelse_typ as AvvikelseTyp] ?? punkt.avvikelse_typ}</div>
        )}
        {punkt.kommentar && <div style={{ ...TYP.meta, color: FARG.text2, overflowWrap: 'anywhere' }}>{punkt.kommentar}</div>}
        {punkt.plan_kommentar && <div style={{ ...TYP.meta, color: FARG.text2, overflowWrap: 'anywhere' }}>{punkt.plan_kommentar}</div>}
        {fotoUrler.length > 0 && (
          <div style={{ display: 'flex', gap: AVSTAND.s, flexWrap: 'wrap' }}>
            {fotoUrler.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt="" style={{ width: TRAFFYTA.primar + AVSTAND.s, height: TRAFFYTA.primar + AVSTAND.s, borderRadius: RADIE.rad, objectFit: 'cover' }} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div data-testid="bricka-rad" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
        {rubrikrad}
        {underrad && (
          <div style={{ ...TYP.meta, color: FARG.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{underrad}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: AVSTAND.s }}>
        {knappar.map((k) => {
          const aktiv = punkt.status === k.status;
          return (
            <button
              key={k.status}
              type="button"
              disabled={sparar}
              aria-pressed={aktiv}
              data-svar={k.status}
              onClick={() => {
                const h = radHandling(k.status, last);
                if (h === 'svara') onSvara(k.status);
                else if (h === 'avvikelse-ark') onAvvikelse();
              }}
              style={{
                ...KNAPP.sekundar, flex: 1, minWidth: 0, minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.xs}px`,
                ...(aktiv ? { background: FARG.text, color: FARG.bg } : {}), opacity: sparar ? 0.4 : 1, whiteSpace: 'nowrap',
              }}
            >
              {k.etikett}
            </button>
          );
        })}
        <button
          type="button"
          disabled={sparar}
          data-svar="foto-not"
          onClick={onFotoNot}
          style={{
            ...KNAPP.sekundar, flex: 1.3, minWidth: 0, minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.xs}px`,
            opacity: sparar ? 0.4 : 1, whiteSpace: 'nowrap',
          }}
        >
          {FOTO_NOT_ETIKETT}
        </button>
      </div>
    </div>
  );
}
