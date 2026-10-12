'use client';

// Ga-vyn: hitta fram till en provyta.
//
// PILEN SLUTAR PEKA UNDER 15 M. Telefonens GPS under krontak ar 5-15 m och
// ytans radie ar 5,64 m - felet ar storre an malet. En pil som pekar med
// decimeterprecision nar positionen ar plus minus tio meter LJUGER, och den
// lognen ar varre an ingen pil. Da sager vyn i stallet att du ar framme och
// att sista biten ar ogat.
//
// KOMPASSEN AKTIVERAS MED ETT TRYCK, aldrig automatiskt. iOS kraver en riktig
// gest for DeviceOrientationEvent.requestPermission - samma linje som
// platsprompten i PR 5. Nekas den visas baring i grader och avstand i stallet,
// och vyn sager rakt ut att pilen inte kunde aktiveras.

import { useCallback, useEffect, useRef, useState } from 'react';
import { T } from '@/lib/utbildning';
import { avstandM, riktning, type LatLng } from '@/lib/provytor';
import type { EgenkontrollProvyta } from '@/lib/egenkontroll';
import RundKarta, { type KartObjektData } from './RundKarta';

/** Under detta slutar pilen peka - se filhuvudet. */
const FRAMME_M = 15;

/** Bäring i grader fran a till b. 0 = norr. */
function baring(a: LatLng, b: LatLng): number {
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180, lat2 = (b.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

type OrienteringsLage = 'ej_fragad' | 'pa' | 'nekad' | 'saknas';

export default function GaTillYta({
  yta,
  objekt,
  punkter,
  kontext,
  provytor,
  baskarta,
  overlays,
  egnaVarden,
  onStang,
  onMat,
}: {
  yta: EgenkontrollProvyta;
  objekt: KartObjektData | null;
  punkter: Parameters<typeof RundKarta>[0]['punkter'];
  kontext: { data: any }[];
  provytor: EgenkontrollProvyta[];
  // Kartvalen foljer med hit - ga-vyn ska inte visa en annan karta an den man
  // just tittade pa i helskarmen.
  baskarta?: Parameters<typeof RundKarta>[0]['baskarta'];
  overlays?: Parameters<typeof RundKarta>[0]['overlays'];
  egnaVarden?: Record<string, boolean>;
  onStang: () => void;
  onMat: () => void;
}) {
  const [minPosition, setMinPosition] = useState<{ lat: number; lng: number; noggrannhet: number | null } | null>(null);
  const [enhetsRiktning, setEnhetsRiktning] = useState<number | null>(null);
  const [orientering, setOrientering] = useState<OrienteringsLage>('ej_fragad');
  const lyssnarRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  const mal: LatLng | null = yta.lat != null && yta.lng != null ? { lat: yta.lat, lng: yta.lng } : null;
  const avstand = minPosition && mal ? avstandM(minPosition, mal) : null;
  const grader = minPosition && mal ? baring(minPosition, mal) : null;
  const kompass = minPosition && mal ? riktning(minPosition, mal) : null;
  const framme = avstand != null && avstand <= FRAMME_M;

  // Kompassen kopplas in FORST vid tryck.
  const aktiveraKompass = useCallback(async () => {
    const DO = (typeof window !== 'undefined'
      ? (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent
      : undefined);
    if (!DO) { setOrientering('saknas'); return; }
    try {
      if (typeof DO.requestPermission === 'function') {
        const svar = await DO.requestPermission();
        if (svar !== 'granted') { setOrientering('nekad'); return; }
      }
      const lyssnare = (e: DeviceOrientationEvent) => {
        // iOS ger webkitCompassHeading (grader fran norr, medurs).
        const ios = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
        if (typeof ios === 'number' && Number.isFinite(ios)) { setEnhetsRiktning(ios); return; }
        if (typeof e.alpha === 'number' && Number.isFinite(e.alpha)) setEnhetsRiktning(360 - e.alpha);
      };
      window.addEventListener('deviceorientation', lyssnare, true);
      lyssnarRef.current = lyssnare;
      setOrientering('pa');
    } catch {
      setOrientering('nekad');
    }
  }, []);

  useEffect(() => () => {
    if (lyssnarRef.current) window.removeEventListener('deviceorientation', lyssnarRef.current, true);
  }, []);

  // Pilen ritas relativt telefonens riktning. Utan kompass ingen pil alls.
  const pilVinkel = orientering === 'pa' && enhetsRiktning != null && grader != null
    ? grader - enhetsRiktning
    : null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: T.bg, zIndex: 1200,
      display: 'flex', flexDirection: 'column', fontFamily: T.ff, color: T.t1,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: 'calc(8px + env(safe-area-inset-top)) 12px 8px',
      }}>
        <button onClick={onStang} style={{
          minHeight: 44, minWidth: 44, border: 'none', background: 'transparent',
          color: T.blue, fontSize: 17, fontFamily: T.ff, textAlign: 'left',
        }}>
          Tillbaka
        </button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 600 }}>
          Yta {yta.nummer}
        </span>
        <span style={{ minWidth: 44 }} />
      </div>

      {/* PILEN OCH AVSTANDET */}
      <div style={{ padding: '8px 16px 12px', textAlign: 'center' }}>
        {framme ? (
          <>
            <div style={{ fontSize: 44, fontWeight: 700, color: T.green, letterSpacing: -1 }}>
              Du är framme
            </div>
            <div style={{ fontSize: 15, color: T.t2, lineHeight: 1.5, marginTop: 6 }}>
              Ytan är inom {Math.round(avstand!)} m. Sista biten är ögat — GPS:en är
              {minPosition?.noggrannhet != null ? ` ±${Math.round(minPosition.noggrannhet)} m` : ' osäker'} och
              ytan bara 5,64 m i radie. Leta efter snitseln om ytan är märkt.
            </div>
          </>
        ) : (
          <>
            {pilVinkel != null ? (
              <div
                aria-hidden="true"
                style={{
                  fontSize: 92, lineHeight: 1, color: T.blue,
                  transform: `rotate(${pilVinkel}deg)`, transition: 'transform 160ms linear',
                }}
              >
                ↑
              </div>
            ) : (
              <div style={{ fontSize: 34, fontWeight: 700, color: T.t1 }}>
                {grader != null ? `${Math.round(grader)}°` : '—'}
                {kompass && <span style={{ fontSize: 20, color: T.t2 }}> {kompass}</span>}
              </div>
            )}

            <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1.5, marginTop: 4 }}>
              {avstand == null ? '—' : avstand < 1000 ? `${Math.round(avstand)} m` : `${(avstand / 1000).toFixed(1)} km`}
            </div>
            {/* Riktningen i ORD ocksa - pilen ar aldrig ensam informationsbarare. */}
            {kompass && (
              <div style={{ fontSize: 16, color: T.t2 }}>
                {kompass}{grader != null && ` · ${Math.round(grader)}°`}
              </div>
            )}
            {minPosition?.noggrannhet != null && (
              <div style={{ fontSize: 13, color: T.t2, marginTop: 4 }}>
                Din position ±{Math.round(minPosition.noggrannhet)} m
              </div>
            )}
          </>
        )}

        {orientering !== 'pa' && !framme && (
          <div style={{ marginTop: 10 }}>
            {orientering === 'ej_fragad' ? (
              <button onClick={aktiveraKompass} style={{
                minHeight: 44, width: '100%', borderRadius: 10,
                border: `1.5px solid ${T.blue}`, background: 'transparent',
                color: T.blue, fontSize: 16, fontWeight: 600, fontFamily: T.ff,
              }}>
                Aktivera kompass
              </button>
            ) : (
              <div style={{ fontSize: 13, color: T.orange, lineHeight: 1.45 }}>
                {orientering === 'nekad'
                  ? 'Pilen kunde inte aktiveras — platsriktning nekades. Bäringen ovan gäller från norr.'
                  : 'Pilen kunde inte aktiveras — telefonen ger ingen riktning. Bäringen ovan gäller från norr.'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* KARTAN centrerad pa ytan - samma komponent som rundvyn och helskarm. */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <RundKarta
          objekt={objekt}
          punkter={punkter}
          kontext={kontext}
          provytor={provytor}
          valdPunktId={null}
          hojd="100%"
          centreraPa={mal}
          baskarta={baskarta}
          overlays={overlays}
          egnaVarden={egnaVarden}
          onPosition={setMinPosition}
        />
      </div>

      <div style={{ padding: '10px 12px calc(10px + env(safe-area-inset-bottom))' }}>
        <button onClick={onMat} style={{
          width: '100%', minHeight: 52, borderRadius: 12, border: 'none',
          background: T.green, color: '#000', fontSize: 17, fontWeight: 700, fontFamily: T.ff,
        }}>
          Mät ytan
        </button>
      </div>
    </div>
  );
}
