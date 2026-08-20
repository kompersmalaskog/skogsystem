'use client';

// Formularet for en avvikelse - och for ett foto pa en utforandepunkt.
//
// SPARORDNINGEN AR POANGEN. Bilden laddas upp FORST. Punkten och fotoraden
// skrivs SIST, nar sokvagen finns. Misslyckas uppladdningen stangs formularet
// ALDRIG: typvalet, bilden, positionen och kommentaren ligger kvar i minnet
// och gar att skicka om. I skogen ar tackningen borta ofta, och kastar vi
// inmatningen nar natet sviker slutar folk registrera avvikelser.
// Planeraren avgor om det far sparas utan bild - inte appen.

import { useCallback, useEffect, useRef, useState } from 'react';
import { T } from '@/lib/utbildning';
import {
  svaraMedAvvikelse,
  laggTillFoto,
  sparaPunktKommentar,
  AVVIKELSE_TYPER,
  AVVIKELSE_ETIKETT,
  type AvvikelseTyp,
  type EgenkontrollPunkt,
} from '@/lib/egenkontroll';
import { komprimeraBild, byggSokvag, laddaUppFoto } from '@/lib/egenkontrollfoto';

type Position = { lat: number; lng: number; noggrannhet: number | null };

export type SheetLage = 'avvikelse' | 'foto';

export default function AvvikelseSheet({
  lage,
  punkt,
  egenkontrollId,
  onStang,
  onSparad,
}: {
  lage: SheetLage;
  punkt: EgenkontrollPunkt;
  egenkontrollId: string;
  onStang: () => void;
  onSparad: () => void;
}) {
  const arAvvikelse = lage === 'avvikelse';

  const [typ, setTyp] = useState<AvvikelseTyp | null>(
    (punkt.avvikelse_typ as AvvikelseTyp | null) ?? null,
  );
  const [bild, setBild] = useState<Blob | null>(null);
  const [forhandsvisning, setForhandsvisning] = useState<string | null>(null);
  const [kommentar, setKommentar] = useState(punkt.kommentar ?? '');
  const [position, setPosition] = useState<Position | null>(null);
  const [positionsFel, setPositionsFel] = useState<string | null>(null);
  const [hamtarPosition, setHamtarPosition] = useState(false);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  /** Rakna misslyckade forsok - "Spara utan foto" visas forst efter ett omforsok. */
  const [misslyckanden, setMisslyckanden] = useState(0);

  const filRef = useRef<HTMLInputElement>(null);

  // Objekt-URL:en maste ateranvandas tills bilden byts, annars lacker den.
  useEffect(() => {
    if (!bild) return;
    const url = URL.createObjectURL(bild);
    setForhandsvisning(url);
    return () => URL.revokeObjectURL(url);
  }, [bild]);

  const hamtaPosition = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPositionsFel('Position kunde inte hämtas');
      return;
    }
    setHamtarPosition(true);
    setPositionsFel(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          noggrannhet: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
        });
        setHamtarPosition(false);
      },
      () => {
        // Sag vad som hande - aldrig en tyst tom position.
        setPositionsFel('Position kunde inte hämtas');
        setHamtarPosition(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }, []);

  // Automatiskt forsok forst. I den INSTALLERADE PWA:n pa iOS ges ingen
  // platsprompt utan en riktig gest, sa den har vagen kan tystna dar - da
  // finns knappen "Hämta position" som reserv. Bara i avvikelselaget:
  // ett foto pa nagot som blev bra ska inte utlosa en platsprompt.
  useEffect(() => {
    if (arAvvikelse) hamtaPosition();
  }, [arAvvikelse, hamtaPosition]);

  const valjBild = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fil = e.target.files?.[0];
    e.target.value = ''; // sa samma bild kan valjas igen
    if (!fil) return;
    setFel(null);
    try {
      setBild(await komprimeraBild(fil));
    } catch (err) {
      setFel(err instanceof Error ? err.message : 'Bilden kunde inte behandlas.');
    }
  };

  /** utanFoto = planerarens beslut efter att uppladdningen strulat. */
  const spara = async (utanFoto: boolean) => {
    setSparar(true);
    setFel(null);
    try {
      // 1. BILDEN FORST. Punkten skrivs inte forran sokvagen finns.
      let sokvag: string | null = null;
      if (bild && !utanFoto) {
        sokvag = byggSokvag(egenkontrollId, punkt.id);
        await laddaUppFoto(sokvag, bild);
      }

      // 2. Punkten.
      if (arAvvikelse) {
        if (!typ) throw new Error('Välj vad som är fel innan du sparar.');
        await svaraMedAvvikelse(punkt.id, {
          typ,
          kommentar,
          lat: position?.lat ?? null,
          lng: position?.lng ?? null,
        });
      } else if (kommentar.trim() !== (punkt.kommentar ?? '')) {
        await sparaPunktKommentar(punkt.id, kommentar);
      }

      // 3. Fotoraden SIST.
      if (sokvag) {
        await laggTillFoto({
          egenkontrollId,
          punktId: punkt.id,
          sokvag,
          lat: position?.lat ?? null,
          lng: position?.lng ?? null,
        });
      }

      onSparad();
    } catch (err) {
      // Formularet stangs INTE. Allt inmatat ligger kvar.
      setMisslyckanden((n) => n + 1);
      setFel(err instanceof Error ? err.message : 'Kunde inte spara.');
    } finally {
      setSparar(false);
    }
  };

  const kanSpara = arAvvikelse ? !!typ && !!bild : !!bild || kommentar.trim() !== '';
  const visaSparaUtanFoto = misslyckanden >= 2 && !!bild;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={arAvvikelse ? 'Registrera avvikelse' : 'Lägg till foto'}
      onClick={() => { if (!sparar) onStang(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.group, borderRadius: '16px 16px 0 0',
          padding: '20px 16px calc(20px + env(safe-area-inset-bottom))',
          width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto',
          fontFamily: T.ff, color: T.t1,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>
          {arAvvikelse ? 'Vad är fel?' : 'Lägg till foto'}
        </div>
        <div style={{ fontSize: 14, color: T.t2, marginBottom: 16 }}>{punkt.rubrik}</div>

        {/* 1. TYPEN - exakt fyra, tva i bredd, 52 pt. Fler skulle behova bli en
            lista, och da tar valet tre ganger sa lang tid i regn. */}
        {arAvvikelse && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
            {AVVIKELSE_TYPER.map((t) => {
              const vald = typ === t;
              return (
                <button
                  key={t}
                  onClick={() => setTyp(t)}
                  aria-pressed={vald}
                  style={{
                    minHeight: 52,
                    borderRadius: 10,
                    border: `1.5px solid ${vald ? T.red : 'rgba(255,255,255,0.14)'}`,
                    background: vald ? T.red : 'transparent',
                    color: vald ? '#fff' : T.t1,
                    fontSize: 16, fontWeight: 600, fontFamily: T.ff,
                  }}
                >
                  {AVVIKELSE_ETIKETT[t]}
                </button>
              );
            })}
          </div>
        )}

        {/* 2. BILDEN. Kameran direkt via capture, inte ett filval. */}
        <input
          ref={filRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={valjBild}
          style={{ display: 'none' }}
        />
        {forhandsvisning ? (
          <div style={{ marginBottom: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={forhandsvisning}
              alt="Foto på avvikelsen"
              style={{ width: '100%', borderRadius: 10, display: 'block' }}
            />
            <button
              onClick={() => filRef.current?.click()}
              disabled={sparar}
              style={knappStil(false)}
            >
              Ta om bilden
            </button>
          </div>
        ) : (
          <button
            onClick={() => filRef.current?.click()}
            disabled={sparar}
            style={{ ...knappStil(false), marginBottom: 14 }}
          >
            {arAvvikelse ? 'Ta foto (krävs)' : 'Ta foto'}
          </button>
        )}

        {/* 3. POSITIONEN - kvitto, aldrig inmatning. */}
        {arAvvikelse && (
          <div style={{ marginBottom: 16 }}>
            {position ? (
              <div style={{ fontSize: 14, color: T.t2 }}>
                Position sparad · {position.lat.toFixed(4)}, {position.lng.toFixed(4)}
                {position.noggrannhet != null && ` · ±${Math.round(position.noggrannhet)} m`}
              </div>
            ) : hamtarPosition ? (
              <div style={{ fontSize: 14, color: T.t2 }}>Hämtar position…</div>
            ) : (
              <>
                <div style={{ fontSize: 14, color: T.orange, marginBottom: 6 }}>
                  {positionsFel ?? 'Position kunde inte hämtas'}
                </div>
                <button onClick={hamtaPosition} disabled={sparar} style={knappStil(false)}>
                  Hämta position
                </button>
                <div style={{ fontSize: 13, color: T.t2, marginTop: 6 }}>
                  Avvikelsen går att spara ändå.
                </div>
              </>
            )}
          </div>
        )}

        {/* 4. KOMMENTAREN - valfri. Skrivs till kolumnen kommentar, aldrig
            plan_kommentar (planerarens text fran planeringen). */}
        <input
          value={kommentar}
          onChange={(e) => setKommentar(e.target.value)}
          placeholder="Kommentar (valfritt)"
          style={{
            width: '100%', minHeight: 44, boxSizing: 'border-box',
            borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.14)',
            background: 'transparent', color: T.t1, fontSize: 16,
            fontFamily: T.ff, padding: '0 12px', marginBottom: 16,
          }}
        />

        {fel && (
          <div
            role="alert"
            style={{
              background: 'rgba(255,69,58,0.15)', border: `1px solid ${T.red}`,
              borderRadius: 10, padding: '10px 12px', fontSize: 14,
              lineHeight: 1.4, marginBottom: 14,
            }}
          >
            <div style={{ marginBottom: 4 }}>{fel}</div>
            <div style={{ color: T.t2, fontSize: 13 }}>
              Inget är förlorat — det du fyllt i ligger kvar.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => spara(false)}
            disabled={sparar || !kanSpara}
            style={knappStil(true, sparar || !kanSpara)}
          >
            {sparar ? 'Sparar…' : fel ? 'Försök igen' : 'Spara'}
          </button>

          {/* Visas forst efter ett misslyckat OMFORSOK - planeraren avgor da
              om avvikelsen ar mer vard an bilden. */}
          {visaSparaUtanFoto && (
            <button onClick={() => spara(true)} disabled={sparar} style={knappStil(false)}>
              Spara utan foto
            </button>
          )}

          <button onClick={onStang} disabled={sparar} style={knappStil(false)}>
            Avbryt
          </button>
        </div>
      </div>
    </div>
  );
}

function knappStil(primar: boolean, inaktiv = false): React.CSSProperties {
  return {
    width: '100%',
    minHeight: 44,
    borderRadius: 10,
    border: primar ? 'none' : '1.5px solid rgba(255,255,255,0.14)',
    background: primar ? (inaktiv ? '#2C2C2E' : T.green) : 'transparent',
    color: primar ? (inaktiv ? T.t2 : '#000') : T.t1,
    fontSize: 16,
    fontWeight: 600,
    fontFamily: T.ff,
  };
}
