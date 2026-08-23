'use client';

// Avstandslistan under kartan. Sa har gar man: man laser inte en karta, man
// foljer en riktning och ett avstand.
//
// SANNINGEN OM NOGGRANNHETEN star med. Telefonens GPS under krontak ar 5-15 m
// och ytan ar 5,64 m i radie - man hittar inte tillbaka till exakt samma yta.
// Darfor visas noggrannheten i meter, och en yta som snitslats i falt markeras,
// for da - och bara da - gar en kontrollmatning att gora pa samma yta.

import { T } from '@/lib/utbildning';
import { avstandM, riktning, skadeandel } from '@/lib/provytor';
import type { EgenkontrollProvyta } from '@/lib/egenkontroll';

const GUL = '#FFD60A';

export type MinPosition = { lat: number; lng: number; noggrannhet: number | null } | null;

export default function ProvyteLista({
  provytor,
  minPosition,
  last,
  onValj,
}: {
  provytor: EgenkontrollProvyta[];
  minPosition: MinPosition;
  last: boolean;
  onValj: (yta: EgenkontrollProvyta) => void;
}) {
  if (provytor.length === 0) return null;

  // Sorterad pa avstand nar vi vet var vi ar, annars pa nummer.
  const rader = provytor
    .map((y) => ({
      yta: y,
      avstand: minPosition && y.lat != null && y.lng != null
        ? avstandM(minPosition, { lat: y.lat, lng: y.lng })
        : null,
      riktn: minPosition && y.lat != null && y.lng != null
        ? riktning(minPosition, { lat: y.lat, lng: y.lng })
        : null,
    }))
    .sort((a, b) =>
      a.avstand != null && b.avstand != null
        ? a.avstand - b.avstand
        : a.yta.nummer - b.yta.nummer,
    );

  return (
    <div style={{ marginBottom: 12 }}>
      {!minPosition && (
        <div style={{ fontSize: 13, color: T.orange, lineHeight: 1.45, margin: '0 4px 8px' }}>
          Utan din position går det inte att säga avstånd och riktning — ytorna
          listas i nummerordning.
        </div>
      )}
      {minPosition?.noggrannhet != null && (
        <div style={{ fontSize: 12.5, color: T.t2, lineHeight: 1.45, margin: '0 4px 8px' }}>
          Din position är ±{Math.round(minPosition.noggrannhet)} m. Ytan är 5,64 m i
          radie — utan snitsel hittar du inte tillbaka till exakt samma yta.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rader.map(({ yta, avstand, riktn }) => {
          const andel = skadeandel(yta.antal_frisk, yta.antal_skadad);
          const klar = yta.overhoppad || yta.matt != null;
          return (
            <button
              key={yta.id}
              onClick={() => onValj(yta)}
              disabled={last}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                minHeight: 44, padding: '10px 14px', borderRadius: 12,
                border: 'none', background: T.group, color: T.t1,
                fontFamily: T.ff, textAlign: 'left',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 12, height: 12, borderRadius: 6, flexShrink: 0,
                  background: klar ? '#0A84FF' : 'transparent',
                  border: '2px solid #0A84FF', boxSizing: 'border-box',
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 500 }}>Yta {yta.nummer}</span>
                <span style={{ display: 'block', fontSize: 13, color: T.t2, marginTop: 1 }}>
                  {yta.overhoppad
                    ? `Överhoppad — ${yta.kommentar}`
                    : andel != null
                      ? `${andel} % skadade · ${(yta.antal_frisk ?? 0) + (yta.antal_skadad ?? 0)} träd`
                      : 'Inte mätt'}
                  {yta.markt_i_falt && ' · snitslad'}
                </span>
              </span>
              {avstand != null && (
                <span style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ display: 'block', fontSize: 16, fontWeight: 600 }}>
                    {avstand < 1000 ? `${Math.round(avstand)} m` : `${(avstand / 1000).toFixed(1)} km`}
                  </span>
                  <span style={{ display: 'block', fontSize: 13, color: T.t2 }}>{riktn}</span>
                </span>
              )}
              {!yta.overhoppad && andel != null && (
                <span aria-hidden="true" style={{ width: 4, height: 28, borderRadius: 2, background: GUL, flexShrink: 0 }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
