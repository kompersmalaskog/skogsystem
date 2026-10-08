'use client';

// Sammanstallning av provytorna. Delas av rundvyn och dokumentet pa objektet
// sa de tva aldrig kan saga olika saker om samma matning. Raknar gor
// sammanstallProvytor i lib/provytor.ts - samma funktion ska PDF-rapporten
// anvanda, sa att tre ytor inte kan visa tre olika siffror.
//
// MEDELVARDET AR EN SAMMANFATTNING, INTE KALLAN. Varje ytas egna varden star
// under - samma princip som stubbarnas tackningsgrad. Ett medelvarde vars
// delar inte gar att granska ar falsk precision.
//
// SKADEANDELEN RAKNAS UR SUMMORNA (alla skadade trad / alla trad over de matta
// ytorna), aldrig som medelvarde av ytornas procent: det viktar en yta med nio
// trad lika tungt som en med femtio. Raknatalen star bredvid, sa procenten gar
// att kontrollrakna.
//
// INGA GRANSVARDEN OCH INGA BETYG. Talen visas, de domas inte - vilka granser
// som galler for Kompersmala ar Martins beslut, inte nagot koden ska anta.
// Skadeandelen ar gul som mattfarg (en matning, ingen avvikelse mot planen),
// inte som varning.

import { T } from '@/lib/utbildning';
import {
  provytaStatus, sammanstallProvytor, skadeandel,
  type Medelvarde,
} from '@/lib/provytor';
import type { EgenkontrollProvyta } from '@/lib/egenkontroll';

const GUL = '#FFD60A';

/** 4,2 - en decimal, utan avslutande ,0 (32 blir 32, inte 32,0). */
function tal(v: number): string {
  return String(Math.round(v * 10) / 10).replace('.', ',');
}

function ytor(n: number, av: number): string {
  return `${n} av ${av} ${av === 1 ? 'yta' : 'ytor'}`;
}

function Medelrad({
  etikett, enhet, m, antalYtor, fs,
}: { etikett: string; enhet: string; m: Medelvarde; antalYtor: number; fs: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: fs, lineHeight: 1.5 }}>
      <span style={{ color: T.t2 }}>{etikett}</span>
      <span style={{ textAlign: 'right' }}>
        <span style={{ fontWeight: 600 }}>{m.medel == null ? '—' : `${tal(m.medel)} ${enhet}`}</span>
        <span style={{ color: T.t2 }}> ({ytor(m.n, antalYtor)})</span>
      </span>
    </div>
  );
}

export default function ProvyteSammanstallning({
  provytor,
  kompakt,
}: {
  provytor: EgenkontrollProvyta[];
  /** true = dokumentet (mindre text, ingen ram). */
  kompakt?: boolean;
}) {
  if (provytor.length === 0) return null;

  const sam = sammanstallProvytor(provytor);
  const matta = provytor
    .filter((y) => provytaStatus(y) === 'matt')
    .sort((a, b) => a.nummer - b.nummer);
  const overhoppade = provytor
    .filter((y) => provytaStatus(y) === 'overhoppad')
    .sort((a, b) => a.nummer - b.nummer);

  const fs = kompakt ? 13 : 14;

  return (
    <div style={{ fontFamily: T.ff }}>
      <div style={{ fontSize: kompakt ? 14 : 16, fontWeight: 600, marginBottom: 2 }}>
        {sam.antalMatta} av {sam.antalYtor} provytor mätta
        {sam.antalOverhoppade > 0 && (
          <span style={{ color: T.t2, fontWeight: 400 }}>
            {' · '}{sam.antalOverhoppade} {sam.antalOverhoppade === 1 ? 'överhoppad' : 'överhoppade'}
          </span>
        )}
      </div>

      {sam.antalMatta === 0 ? (
        <div style={{ fontSize: fs, color: T.t2, lineHeight: 1.45 }}>
          Ingen yta är mätt ännu — medelvärden visas när minst en är klar.
        </div>
      ) : (
        <>
          {sam.skadeandel.procent != null ? (
            <>
              <div style={{ fontSize: fs + 2, color: GUL, fontWeight: 600 }}>
                {sam.skadeandel.procent} % skadade
              </div>
              <div style={{ fontSize: fs - 1, color: T.t2, marginBottom: 8 }}>
                {sam.skadeandel.skadade} av {sam.skadeandel.trad} träd · {ytor(sam.skadeandel.ytor, sam.antalYtor)}
              </div>
            </>
          ) : (
            <div style={{ fontSize: fs, color: T.t2, marginBottom: 8 }}>
              Inga träd är räknade på de mätta ytorna.
            </div>
          )}

          <Medelrad etikett="Stickvägsbredd" enhet="m" m={sam.stickvagsbredd} antalYtor={sam.antalYtor} fs={fs} />
          <Medelrad etikett="Stickvägsavstånd" enhet="m" m={sam.stickvagsavstand} antalYtor={sam.antalYtor} fs={fs} />
          <Medelrad etikett="Grundyta" enhet="m²/ha" m={sam.grundyta} antalYtor={sam.antalYtor} fs={fs} />
          <div style={{ fontSize: fs - 1, color: T.t2, lineHeight: 1.45, margin: '4px 0 8px' }}>
            Medelvärden över de mätta ytor som har värdet. Varje yta står för sig nedan.
          </div>

          {/* Varje ytas EGNA varden - medelvardet ar inte kallan. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {matta.map((y) => {
              const a = skadeandel(y.antal_frisk, y.antal_skadad);
              return (
                <div key={y.id} style={{ fontSize: fs - 1, color: T.t2 }}>
                  <span style={{ color: T.t1 }}>Yta {y.nummer}</span>
                  {' · '}{a == null ? '—' : `${a} %`}
                  {' · '}{(y.antal_frisk ?? 0) + (y.antal_skadad ?? 0)} träd
                  {y.stickvagsbredd_m != null && ` · bredd ${tal(Number(y.stickvagsbredd_m))} m`}
                  {y.stickvagsavstand_m != null && ` · avstånd ${tal(Number(y.stickvagsavstand_m))} m`}
                  {y.grundyta_m2_ha != null && ` · grundyta ${tal(Number(y.grundyta_m2_ha))} m²/ha`}
                  {y.markt_i_falt && ' · snitslad'}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Overhoppade ytor MED sitt skal - annars ser dokumentet fullstandigt ut
          fast en yta aldrig besoktes. */}
      {overhoppade.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {overhoppade.map((y) => (
            <div key={y.id} style={{ fontSize: fs - 1, color: T.t2 }}>
              <span style={{ color: T.t1 }}>Yta {y.nummer}</span> · överhoppad — {y.kommentar}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
