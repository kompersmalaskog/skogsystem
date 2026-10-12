'use client';

// Avstandslistan under kartan. Sa har gar man: man laser inte en karta, man
// foljer en riktning och ett avstand.
//
// SANNINGEN OM NOGGRANNHETEN star med. Telefonens GPS under krontak ar 5-15 m
// och ytan ar 5,64 m i radie - man hittar inte tillbaka till exakt samma yta.
// Darfor visas noggrannheten i meter, och en yta som snitslats i falt markeras,
// for da - och bara da - gar en kontrollmatning att gora pa samma yta.

import { T } from '@/lib/utbildning';
import { avstandM, provytaStatus, riktning, skadeandel } from '@/lib/provytor';
import type { EgenkontrollProvyta } from '@/lib/egenkontroll';
import ProvytaMarke from './ProvytaMarke';

const GUL = '#FFD60A';

export type MinPosition = { lat: number; lng: number; noggrannhet: number | null } | null;

export default function ProvyteLista({
  provytor,
  minPosition,
  last,
  onValj,
  onGaTill,
}: {
  provytor: EgenkontrollProvyta[];
  minPosition: MinPosition;
  last: boolean;
  onValj: (yta: EgenkontrollProvyta) => void;
  /** Ga-vyn. Utelamnad pa en last runda - da finns inget att ga till. */
  onGaTill?: (yta: EgenkontrollProvyta) => void;
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

  // NASTA ATT GORA: narmaste OMATTA ytan. Den lyfts fram sa man ser vilken man
  // ska till utan att lasa hela listan. Ar allt matt eller overhoppat finns
  // ingen sadan - da visas ingen markering alls.
  const nastaId = rader.find(({ yta }) => provytaStatus(yta) === 'omatt')?.yta.id ?? null;

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
          const status = provytaStatus(yta);
          const nasta = yta.id === nastaId;
          return (
            <div key={yta.id} style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
            <button
              onClick={() => onValj(yta)}
              disabled={last}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0,
                minHeight: 44, padding: '10px 14px', borderRadius: 12,
                border: 'none', background: T.group, color: T.t1,
                fontFamily: T.ff, textAlign: 'left',
                outline: nasta ? `2px solid ${T.blue}` : 'none', outlineOffset: -2,
              }}
            >
              {/* Samma form som pa kartan: ihalig = omatt, fylld med bock = matt,
                  nedtonad med streck = overhoppad. Texten nedan sager det i ord. */}
              <ProvytaMarke status={status} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 500 }}>Yta {yta.nummer}</span>
                {/* Texten bar beskedet - ramen upprepar bara det. */}
                {nasta && (
                  <span style={{ color: T.blue, fontSize: 13, fontWeight: 600, marginLeft: 8 }}>
                    nästa
                  </span>
                )}
                <span style={{ display: 'block', fontSize: 13, color: T.t2, marginTop: 1 }}>
                  {status === 'overhoppad'
                    ? `Överhoppad — ${yta.kommentar}`
                    : status === 'omatt'
                      ? 'Inte mätt'
                      : andel != null
                        ? `${andel} % skadade · ${(yta.antal_frisk ?? 0) + (yta.antal_skadad ?? 0)} träd`
                        : 'Mätt'}
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
              {status === 'matt' && andel != null && (
                <span aria-hidden="true" style={{ width: 4, height: 28, borderRadius: 2, background: GUL, flexShrink: 0 }} />
              )}
            </button>

            {onGaTill && !last && yta.lat != null && (
              <button
                onClick={() => onGaTill(yta)}
                aria-label={`Gå till yta ${yta.nummer}`}
                style={{
                  minWidth: 56, minHeight: 44, borderRadius: 12,
                  border: `1.5px solid ${nasta ? T.blue : 'rgba(255,255,255,0.14)'}`,
                  background: 'transparent', color: nasta ? T.blue : T.t2,
                  fontSize: 14, fontWeight: 600, fontFamily: T.ff, flexShrink: 0,
                }}
              >
                Gå dit
              </button>
            )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
