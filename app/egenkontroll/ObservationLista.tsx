'use client';

// Observationerna i dokumentet: det besiktaren SAG, atskilt fran det planen fragade om.
//
// Samma komponent i rundvyn (dar en oppen runda later en trycka "Andra") och i oversiktens dokument
// (skrivskyddat). Foto, position och kommentar per observation. De ingar ALDRIG i "N av M klara" -
// de ar tillagg, inte punkter som ska betas av - och de listas darfor under en egen rubrik, aldrig
// bland planpunkterna.

import { AVSTAND, FARG, KNAPP, RADIE, TNUM, TYP, VIKT } from '@/lib/design/tokens';
import type { EgenkontrollPunkt } from '@/lib/egenkontroll';
import {
  OBSERVATION_TON,
  OBSERVATION_TYP_ETIKETT,
  arObservationTon,
  arObservationTyp,
  giltigPosition,
} from '@/lib/egenkontrollObservation';
import { OBSERVATION_TON_FARG } from '@/lib/observationIkon';
import { kortDatum } from './format';

/** "3 observationer" / "1 observation" - det som star bredvid rubriken. */
export function observationAntalText(n: number): string {
  return n === 1 ? '1 observation' : `${n} observationer`;
}

export default function ObservationLista({
  observationer,
  fotoPerPunkt,
  onOppna,
}: {
  observationer: EgenkontrollPunkt[];
  /** Signerade URL:er per punkt-id. Tom = inga, eller kunde inte signeras - da visas ingen miniatyr. */
  fotoPerPunkt: Record<string, string[]>;
  /** Satt = en oppen runda: ett tryck oppnar observationen for andring. Utelamnad = ett dokument, skrivskyddat. */
  onOppna?: (observation: EgenkontrollPunkt) => void;
}) {
  if (observationer.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
      {observationer.map((o) => {
        const ton = arObservationTon(o.status) ? o.status : null;
        const farg = ton ? OBSERVATION_TON_FARG[ton] : FARG.text2;
        const typ = arObservationTyp(o.avvikelse_typ) ? OBSERVATION_TYP_ETIKETT[o.avvikelse_typ] : (o.avvikelse_typ ?? 'Okänd typ');
        const foton = fotoPerPunkt[o.id] ?? [];
        const harPlats = giltigPosition(o.lat, o.lng);
        // En avvikelse utan foto ar ett halvt sparat forsok - sag det, dokumentet far inte pasta mer an det har.
        const fotoSaknas = ton === 'avvikelse' && foton.length === 0;

        const innehall = (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.s, flexWrap: 'wrap' }}>
              <span aria-hidden="true" style={{ ...TYP.text, color: farg, fontWeight: VIKT.fet }}>
                {ton ? OBSERVATION_TON[ton].tecken : '•'}
              </span>
              <span style={{ ...TYP.listtitel, color: FARG.text }}>
                {ton ? OBSERVATION_TON[ton].etikett : (o.status ?? 'Okänd ton')}
              </span>
              <span style={{ ...TYP.meta, color: FARG.text2 }}>{typ}</span>
            </div>
            {o.kommentar && (
              <div style={{ ...TYP.text, color: FARG.text, marginTop: AVSTAND.xs, textAlign: 'left' }}>{o.kommentar}</div>
            )}
            <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, textAlign: 'left', ...TNUM }}>
              {o.besvarad ? kortDatum(o.besvarad) : 'okänt datum'}
              {harPlats && ` · ${(o.lat as number).toFixed(4)}, ${(o.lng as number).toFixed(4)}`}
            </div>
            {fotoSaknas && (
              <div role="status" style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.xs, textAlign: 'left' }}>
                Fotot saknas.
              </div>
            )}
          </>
        );

        return (
          <div key={o.id} style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: AVSTAND.l }}>
            {onOppna ? (
              <button
                onClick={() => onOppna(o)}
                aria-label={`Ändra observationen: ${ton ? OBSERVATION_TON[ton].etikett : 'okänd ton'}, ${typ}`}
                style={{
                  display: 'block', width: '100%', minHeight: KNAPP.tertiar.minHeight, padding: 0, border: 'none',
                  background: 'none', textAlign: 'left', fontFamily: 'inherit', color: FARG.text, cursor: 'pointer',
                }}
              >
                {innehall}
              </button>
            ) : (
              <div>{innehall}</div>
            )}
            {foton.length > 0 && (
              <div style={{ display: 'flex', gap: AVSTAND.s, flexWrap: 'wrap', marginTop: AVSTAND.m }}>
                {foton.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="Foto på observationen" style={{ width: 96, height: 96, borderRadius: RADIE.rad, objectFit: 'cover' }} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
