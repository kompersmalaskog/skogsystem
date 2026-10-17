'use client';

// "Notera har" - formularet for en observation, och for att andra eller ta bort en.
//
// Det man ser ute och som planen inte fragade om. RIS OCH ROS: en rishog som ligger ratt ar lika
// mycket vard som ett spar som gatt fel - det ar den man kan visa nasta forare. Knappen heter
// darfor "Notera har", aldrig "avvikelse".
//
// ORDNINGEN AR FRAGORNAS: ton forst (Bra / Kan bli battre / Avvikelse), sedan typ (Korspar /
// Stubbhojd / Hansyn / Annat - de galler at bada hallen), foto (obligatoriskt vid Avvikelse),
// kommentar (valfri). POSITIONEN ar ett kvitto, aldrig inmatning: den togs nar man tryckte.
//
// SPARORDNINGEN AR POANGEN, som i avvikelsen: bilden laddas upp FORST, raden skrivs DAREFTER
// (CHECK:en kraver position, ton och typ), fotoraden SIST. Misslyckas ett steg stangs formularet
// ALDRIG - det man fyllt i ligger kvar, och "Forsok igen" fortsatter dar det tog stopp i stallet for
// att ladda upp bilden eller skriva raden en gang till. I skogen ar tackningen borta ofta.
//
// BORTTAGNING ar en bekraftelse INUTI arket (aldrig confirm(), aldrig en dialog ovanpa arket).

import { useEffect, useRef, useState } from 'react';
import Ark from '@/components/design/Ark';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TNUM, TYP, VIKT } from '@/lib/design/tokens';
import {
  andraObservation,
  laggTillFoto,
  skapaObservation,
  taBortObservation,
  type EgenkontrollPunkt,
} from '@/lib/egenkontroll';
import {
  OBSERVATION_TON,
  OBSERVATION_TONER,
  OBSERVATION_TYPER,
  OBSERVATION_TYP_ETIKETT,
  arObservationTon,
  arObservationTyp,
  giltigPosition,
  nyttPunktId,
  sparaKrav,
  type ObservationTon,
  type ObservationTyp,
} from '@/lib/egenkontrollObservation';
import { positionSkalText } from '@/lib/egenkontrollFlode';
import { byggSokvag, komprimeraBild, laddaUppFoto } from '@/lib/egenkontrollfoto';
import { OBSERVATION_TON_FARG } from '@/lib/observationIkon';
import type { LevandePosition } from './useMinPosition';

type Position = { lat: number; lng: number; noggrannhet: number | null };

/** Tonknappen: tecken over ord, 56 hog. Typknapparna ar 52, fotot 52 - handske i skog. */
const TON_HOJD = 56;
const VAL_HOJD = 52;

export default function ObservationSheet({
  lage,
  egenkontrollId,
  observation,
  fotoUrler = [],
  startPosition,
  pos,
  onStang,
  onSparad,
}: {
  /** ny = "Notera har"; andra = en befintlig observation oppnad fran kartan eller dokumentet. */
  lage: 'ny' | 'andra';
  egenkontrollId: string;
  /** Bara i lage 'andra'. */
  observation?: EgenkontrollPunkt;
  /** Signerade URL:er for observationens befintliga bilder (lage 'andra'). */
  fotoUrler?: string[];
  /** Positionen i det ogonblick man tryckte "Notera har". null = ingen fix an - arket vantar pa den levande. */
  startPosition?: Position | null;
  /** Sidans levande position. Arket tar den forsta duglig fix som kommer om startPosition saknas. */
  pos: LevandePosition;
  onStang: () => void;
  /** Efter en sparad, andrad eller borttagen observation - och efter ett delvis sparat forsok. Sidan laser om. */
  onSparad: () => void;
}) {
  const arNy = lage === 'ny';

  const [ton, setTon] = useState<ObservationTon | null>(
    observation && arObservationTon(observation.status) ? observation.status : null,
  );
  const [typ, setTyp] = useState<ObservationTyp | null>(
    observation && arObservationTyp(observation.avvikelse_typ) ? observation.avvikelse_typ : null,
  );
  const [kommentar, setKommentar] = useState(observation?.kommentar ?? '');
  const [bild, setBild] = useState<Blob | null>(null);
  const [forhandsvisning, setForhandsvisning] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);
  const [tarBort, setTarBort] = useState(false);
  const [bekrafta, setBekrafta] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  /** Misslyckade forsok - "Spara utan foto" visas forst efter ett omforsok, och aldrig vid en avvikelse. */
  const [misslyckanden, setMisslyckanden] = useState(0);

  // POSITIONEN: den som togs vid trycket; saknades den, den forsta duglig fix som kommer. Sedan fast -
  // kvittot far inte flytta sig under en medan man skriver.
  const [fast, setFast] = useState<Position | null>(
    startPosition && giltigPosition(startPosition.lat, startPosition.lng) ? startPosition : null,
  );
  useEffect(() => {
    if (!arNy || fast || !pos.position) return;
    if (giltigPosition(pos.position.lat, pos.position.lng)) setFast(pos.position);
  }, [arNy, fast, pos.position]);

  const filRef = useRef<HTMLInputElement>(null);
  // Ett id for hela forsoket: bildens sokvag bar det, och ett omforsok far inte skapa en ny rad.
  const idRef = useRef<string>(observation?.id ?? nyttPunktId());
  // Vad som redan ar gjort - sa "Forsok igen" fortsatter dar det tog stopp.
  const steg = useRef<{ sokvag: string | null; radenKlar: boolean; fotoradKlar: boolean; borttagen: boolean }>({
    sokvag: null, radenKlar: false, fotoradKlar: false, borttagen: false,
  });

  // Objekt-URL:en ateranvands tills bilden byts, annars lacker den.
  useEffect(() => {
    if (!bild) { setForhandsvisning(null); return; }
    const url = URL.createObjectURL(bild);
    setForhandsvisning(url);
    return () => URL.revokeObjectURL(url);
  }, [bild]);

  const valjBild = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fil = e.target.files?.[0];
    e.target.value = ''; // sa att samma bild kan valjas igen
    if (!fil) return;
    setFel(null);
    try {
      setBild(await komprimeraBild(fil));
      // En ny bild ar en ny fil: den som kanske redan laddats upp i ett misslyckat forsok galler inte langre.
      if (!steg.current.fotoradKlar) steg.current.sokvag = null;
    } catch (err) {
      setFel(err instanceof Error ? err.message : 'Bilden kunde inte behandlas.');
    }
  };

  const antalFoton = fotoUrler.length + (bild ? 1 : 0);
  const krav = sparaKrav({ ton, typ, antalFoton, harPosition: arNy ? !!fast : true });
  const andrad =
    arNy ||
    ton !== (observation?.status ?? null) ||
    typ !== (observation?.avvikelse_typ ?? null) ||
    kommentar.trim() !== (observation?.kommentar ?? '').trim() ||
    !!bild;
  const kanSpara = krav.kan && andrad && !sparar && !tarBort;

  /** utanFoto = besiktarens val efter att uppladdningen strulat; bara for ton som inte kraver bild. */
  const spara = async (utanFoto: boolean) => {
    if (!ton || !typ) return;
    setSparar(true);
    setFel(null);
    try {
      const id = idRef.current;

      // 1. BILDEN FORST. Raden skrivs inte forran sokvagen finns.
      if (bild && !utanFoto && !steg.current.sokvag) {
        const sokvag = byggSokvag(egenkontrollId, id);
        await laddaUppFoto(sokvag, bild);
        steg.current.sokvag = sokvag;
      }
      const sokvag = utanFoto ? null : steg.current.sokvag;

      // 2. Raden.
      if (!steg.current.radenKlar) {
        if (arNy) {
          if (!fast) throw new Error('Positionen saknas — hämta den innan du sparar.');
          await skapaObservation({
            id, egenkontrollId, ton, typ, kommentar, lat: fast.lat, lng: fast.lng, harFoto: !!sokvag,
          });
        } else {
          await andraObservation(id, { ton, typ, kommentar, antalFoton: fotoUrler.length + (sokvag ? 1 : 0) });
        }
        steg.current.radenKlar = true;
      }

      // 3. Fotoraden SIST.
      if (sokvag && !steg.current.fotoradKlar) {
        try {
          await laggTillFoto({
            egenkontrollId, punktId: id, sokvag,
            lat: arNy ? fast?.lat ?? null : observation?.lat ?? null,
            lng: arNy ? fast?.lng ?? null : observation?.lng ?? null,
          });
        } catch (err) {
          // Raden finns redan. Sag det rakt ut - "Forsok igen" skriver bara fotoraden.
          const orsak = err instanceof Error ? err.message : 'okänt fel';
          throw new Error(`Observationen är sparad, men bilden kunde inte läggas till: ${orsak}`);
        }
        steg.current.fotoradKlar = true;
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

  const taBort = async () => {
    if (!observation) return;
    setTarBort(true);
    setFel(null);
    try {
      await taBortObservation(observation.id);
      steg.current.borttagen = true;
      onSparad();
    } catch (err) {
      setFel(err instanceof Error ? err.message : 'Kunde inte ta bort observationen.');
      setBekrafta(false);
    } finally {
      setTarBort(false);
    }
  };

  /** Stang. Har raden hunnit skrivas men inte resten laser sidan om - annars saknas observationen i listan. */
  const stang = () => {
    if (sparar || tarBort) return;
    if (steg.current.radenKlar || steg.current.borttagen) onSparad();
    else onStang();
  };

  const visaSparaUtanFoto = misslyckanden >= 2 && !!bild && ton !== 'avvikelse' && !steg.current.radenKlar;

  return (
    <Ark
      rubrik={arNy ? 'Notera här' : 'Observation'}
      onStang={stang}
      fot={
        <>
          {!krav.kan && !sparar && krav.saknas && (
            <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>{krav.saknas}</p>
          )}
          <button
            onClick={() => spara(false)}
            disabled={!kanSpara}
            style={{ ...KNAPP.primar, ...(kanSpara ? {} : INAKTIV) }}
          >
            {sparar ? 'Sparar…' : fel ? 'Försök igen' : arNy ? 'Spara observationen' : 'Spara ändringen'}
          </button>
          {visaSparaUtanFoto && (
            <button onClick={() => spara(true)} disabled={sparar} style={KNAPP.sekundar}>
              Spara utan foto
            </button>
          )}
        </>
      }
    >
      {/* POSITIONEN - kvitto, aldrig inmatning. */}
      <div style={{ marginBottom: AVSTAND.l }}>
        {arNy ? (
          fast ? (
            <p style={{ margin: 0, ...TYP.meta, color: FARG.text2, ...TNUM }}>
              Position tagen · {fast.lat.toFixed(4)}, {fast.lng.toFixed(4)}
              {fast.noggrannhet != null && ` · ±${Math.round(fast.noggrannhet)} m`}
            </p>
          ) : pos.status === 'saknas' ? (
            <div role="status">
              <p style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>
                Positionen kunde inte hämtas. {positionSkalText(pos.skal, pos.senasteNoggrannhet)}
              </p>
              <p style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.s}px`, ...TYP.meta, color: FARG.text2 }}>
                Observationen går inte att spara utan position.
              </p>
              <button onClick={pos.forsokIgen} style={KNAPP.sekundar}>Försök hämta positionen igen</button>
            </div>
          ) : (
            <p role="status" style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Söker din position…</p>
          )
        ) : observation && giltigPosition(observation.lat, observation.lng) ? (
          <p style={{ margin: 0, ...TYP.meta, color: FARG.text2, ...TNUM }}>
            Noterad här · {(observation.lat as number).toFixed(4)}, {(observation.lng as number).toFixed(4)}
          </p>
        ) : null}
      </div>

      {/* 1. TONEN - tre val, samma ställe varje gang. Tecken + ord: farg ar aldrig ensam. */}
      <Sektion rubrik="Hur ser det ut?" kort={false}>
        <div role="group" aria-label="Hur ser det ut?" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: AVSTAND.s }}>
          {OBSERVATION_TONER.map((t) => {
            const vald = ton === t;
            return (
              <button
                key={t}
                onClick={() => setTon(t)}
                aria-pressed={vald}
                style={{
                  minHeight: TON_HOJD, borderRadius: RADIE.knapp, border: 'none', padding: `${AVSTAND.xs}px ${AVSTAND.xs}px`,
                  background: vald ? OBSERVATION_TON_FARG[t] : FARG.fyllning,
                  color: vald ? FARG.bg : FARG.text,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.xs,
                  fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 17, fontWeight: VIKT.fet, lineHeight: 1 }}>{OBSERVATION_TON[t].tecken}</span>
                <span style={{ ...TYP.meta, fontWeight: VIKT.halvfet, textAlign: 'center' }}>{OBSERVATION_TON[t].etikett}</span>
              </button>
            );
          })}
        </div>
      </Sektion>

      {/* 2. TYPEN - exakt fyra, tva i bredd. De galler at BADA hallen: ett korspar kan vara bra. */}
      <Sektion rubrik="Vad gäller det?" kort={false}>
        <div role="group" aria-label="Vad gäller det?" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: AVSTAND.s }}>
          {OBSERVATION_TYPER.map((t) => {
            const vald = typ === t;
            return (
              <button
                key={t}
                onClick={() => setTyp(t)}
                aria-pressed={vald}
                style={{
                  minHeight: VAL_HOJD, borderRadius: RADIE.knapp, border: 'none',
                  background: vald ? FARG.text : FARG.fyllning,
                  color: vald ? FARG.bg : FARG.text,
                  ...TYP.listtitel, fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                {OBSERVATION_TYP_ETIKETT[t]}
              </button>
            );
          })}
        </div>
      </Sektion>

      {/* 3. FOTOT - obligatoriskt vid Avvikelse, annars valfritt. Kameran direkt via capture. */}
      <Sektion rubrik={ton === 'avvikelse' ? 'Foto (krävs vid avvikelse)' : 'Foto (valfritt)'} kort={false}>
        <input
          ref={filRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={valjBild}
          aria-label="Ta foto"
          style={{ display: 'none' }}
        />
        {fotoUrler.length > 0 && (
          <div style={{ display: 'flex', gap: AVSTAND.s, flexWrap: 'wrap', marginBottom: AVSTAND.s }}>
            {fotoUrler.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt="Foto på observationen" style={{ width: 72, height: 72, borderRadius: RADIE.rad, objectFit: 'cover' }} />
            ))}
          </div>
        )}
        {forhandsvisning ? (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={forhandsvisning} alt="Foto på observationen" style={{ width: '100%', borderRadius: RADIE.rad, display: 'block', marginBottom: AVSTAND.s }} />
            <button onClick={() => filRef.current?.click()} disabled={sparar} style={{ ...KNAPP.sekundar, minHeight: VAL_HOJD }}>
              Ta om bilden
            </button>
          </div>
        ) : (
          <button onClick={() => filRef.current?.click()} disabled={sparar} style={{ ...KNAPP.sekundar, minHeight: VAL_HOJD }}>
            {fotoUrler.length > 0 ? 'Lägg till ett foto' : 'Ta foto'}
          </button>
        )}
      </Sektion>

      {/* 4. KOMMENTAREN - valfri. Skrivs till kolumnen kommentar, aldrig plan_kommentar. */}
      <Sektion rubrik="Kommentar (valfritt)" kort={false}>
        <input
          value={kommentar}
          onChange={(e) => setKommentar(e.target.value)}
          placeholder="Kort kommentar"
          aria-label="Kommentar"
          style={{
            width: '100%', minHeight: VAL_HOJD, boxSizing: 'border-box', borderRadius: RADIE.rad, border: 'none',
            background: FARG.fyllning, color: FARG.text, ...TYP.text, fontFamily: 'inherit', padding: `0 ${AVSTAND.m}px`,
          }}
        />
      </Sektion>

      {fel && (
        <div
          role="alert"
          style={{
            background: FARG.upphojt, border: `1px solid ${FARG.rod}`, borderRadius: RADIE.rad,
            padding: `${AVSTAND.m}px`, marginBottom: AVSTAND.l, ...TYP.meta, color: FARG.text,
          }}
        >
          <div>{fel}</div>
          <div style={{ color: FARG.text2, marginTop: AVSTAND.xs }}>Inget är förlorat — det du fyllt i ligger kvar.</div>
        </div>
      )}

      {/* BORTTAGNING - bara på en befintlig observation, och med bekräftelse INUTI arket. */}
      {!arNy && observation && (
        bekrafta ? (
          <div role="group" aria-label="Ta bort observationen" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
            <p style={{ margin: 0, ...TYP.text, color: FARG.text }}>
              Ta bort observationen? Fotot försvinner också.
            </p>
            <button onClick={taBort} disabled={tarBort} style={{ ...KNAPP.sekundar, color: FARG.rod }}>
              {tarBort ? 'Tar bort…' : 'Ta bort'}
            </button>
            <button onClick={() => setBekrafta(false)} disabled={tarBort} style={KNAPP.sekundar}>
              Behåll
            </button>
          </div>
        ) : (
          <button onClick={() => setBekrafta(true)} disabled={sparar} style={KNAPP.destruktiv}>
            Ta bort observationen
          </button>
        )
      )}
    </Ark>
  );
}
