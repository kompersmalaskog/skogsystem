'use client';

// Sammanstallning av provytorna. Delas av rundvyn och dokumentet pa objektet
// sa de tva aldrig kan saga olika saker om samma matning.
//
// MEDELVARDET AR EN SAMMANFATTNING, INTE KALLAN. Varje ytas egna varden star
// under - samma princip som stubbarnas tackningsgrad. Ett medelvarde vars
// delar inte gar att granska ar falsk precision.
//
// Skadeandelen fargas GULT, aldrig rott. Det ar en matning, inte en avvikelse
// mot planen.

import { T } from '@/lib/utbildning';
import { skadeandel } from '@/lib/provytor';
import type { EgenkontrollProvyta } from '@/lib/egenkontroll';

const GUL = '#FFD60A';

function medel(varden: (number | null)[]): number | null {
  const v = varden.filter((x): x is number => x != null && Number.isFinite(x));
  if (v.length === 0) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function visa(v: number | null, decimaler = 1): string {
  return v == null ? '—' : v.toFixed(decimaler).replace('.', ',');
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

  const matta = provytor.filter((y) => !y.overhoppad && y.matt != null);
  const overhoppade = provytor.filter((y) => y.overhoppad);

  const medelAndel = medel(matta.map((y) => skadeandel(y.antal_frisk, y.antal_skadad)));
  const medelBredd = medel(matta.map((y) => (y.stickvagsbredd_m == null ? null : Number(y.stickvagsbredd_m))));
  const medelAvstand = medel(matta.map((y) => (y.stickvagsavstand_m == null ? null : Number(y.stickvagsavstand_m))));
  const medelGrundyta = medel(matta.map((y) => (y.grundyta_m2_ha == null ? null : Number(y.grundyta_m2_ha))));

  const fs = kompakt ? 13 : 14;

  return (
    <div style={{ fontFamily: T.ff }}>
      <div style={{ fontSize: kompakt ? 14 : 16, fontWeight: 600, marginBottom: 2 }}>
        {matta.length} av {provytor.length} provytor mätta
        {overhoppade.length > 0 && (
          <span style={{ color: T.t2, fontWeight: 400 }}> · {overhoppade.length} överhoppade</span>
        )}
      </div>

      {matta.length === 0 ? (
        <div style={{ fontSize: fs, color: T.t2, lineHeight: 1.45 }}>
          Ingen yta är mätt ännu — medelvärden visas när minst en är klar.
        </div>
      ) : (
        <>
          <div style={{ fontSize: fs, color: GUL, fontWeight: 600, marginBottom: 2 }}>
            {visa(medelAndel, 0)} % skadade i snitt
          </div>
          <div style={{ fontSize: fs - 1, color: T.t2, lineHeight: 1.5, marginBottom: 8 }}>
            Stickvägsbredd {visa(medelBredd)} m · avstånd {visa(medelAvstand)} m · grundyta{' '}
            {visa(medelGrundyta)} m²/ha
            <span style={{ display: 'block' }}>Medelvärden över de mätta ytorna.</span>
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
                  {y.stickvagsbredd_m != null && ` · bredd ${visa(Number(y.stickvagsbredd_m))} m`}
                  {y.stickvagsavstand_m != null && ` · avst ${visa(Number(y.stickvagsavstand_m))} m`}
                  {y.grundyta_m2_ha != null && ` · grundyta ${visa(Number(y.grundyta_m2_ha))}`}
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
