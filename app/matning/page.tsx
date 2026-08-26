'use client';

// Mätvyn — ingången och flödets nav.
//
// Steg 1 mäter grundyta och trädslagsfördelning kvar efter gallring. Punkt.
// Flödet: välj trakt → tio lottade punkter → gå dit → mät → besked direkt →
// sammanfattning när varvet är gjort.
//
// MÄTNING ÄR SPÄRRAD TILLS ENHETEN KALIBRERATS. Utan kalibrering motsvarar
// cirkeln en gissad vinkel, och då mäter man systematiskt fel utan att se det.
// Spärren är hela poängen med kalibreringsskärmen — tas den bort blir skärmen
// en valfri inställning som ingen öppnar.
//
// SPARANDET GÅR LOKALT FÖRST. Varje punkt skrivs till localStorage i samma
// ögonblick varvet sluts, innan något nätanrop försöks. Går synken inte igenom
// står det hur många punkter som väntar — en osynkad punkt får aldrig se ut
// som sparad.
//
// EN MÄTNING PER TRAKTBESÖK. Mätningen ligger kvar lokalt även efter att den
// synkats, med sitt matning_id, och punkterna läggs till den. Rensades den vid
// varje synk skulle nästa punkt starta en ny mätning, och sammanfattningen
// hade räknat medel över en punkt i taget. Den rensas när Martin avslutar
// trakten — och bara om allt ligger i databasen.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { T } from '@/lib/utbildning';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import {
  beskedForPunkt,
  enhetsNamn,
  lasKalibrering,
  osynkadeAntal,
  punktGrundyta,
  varvSlutet,
  type Kalibrering as KalTyp,
  type MattPunkt,
  type MattTrad,
  type PagaendeMatning,
} from '@/lib/matning/lager';
import {
  avslutaMatning,
  laggTillPunkt,
  osynkadMatning,
  startaMatning,
  synka,
} from '@/lib/matning/sparande';
import type { Matpunkt } from '@/lib/matning/punkter';
import Kalibrering from './Kalibrering';
import Kamera from './Kamera';
import Punktval from './Punktval';
import Sammanfattning from './Sammanfattning';

type Trakt = { id: string; namn: string; areal: number | null };
type Lage = 'oversikt' | 'kalibrerar' | 'valjer' | 'matar' | 'sammanfattar';

/** Var Martin faktiskt står när varvet sluts. Skilt från punktens lottade
 *  läge — under krontak är GPS 5-15 m och att lagra det lottade läget som
 *  mätplats vore en tyst osanning. Misslyckas den sparas null, inte en gissning. */
function hamtaPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((klar) => {
    navigator.geolocation.getCurrentPosition(
      (p) => klar(p),
      () => klar(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
    );
  });
}

export default function MatningPage() {
  const { medarbetare } = useCurrentMedarbetare();
  const [lage, setLage] = useState<Lage>('oversikt');
  const [kal, setKal] = useState<KalTyp | null>(null);
  const [laddat, setLaddat] = useState(false);
  const [matning, setMatning] = useState<PagaendeMatning | null>(null);
  const [trakt, setTrakt] = useState<Trakt | null>(null);
  const [punkt, setPunkt] = useState<Matpunkt | null>(null);
  const [senaste, setSenaste] = useState<{ rad: string; avvikande: boolean; grundyta: number } | null>(null);
  const [synkfel, setSynkfel] = useState<string | null>(null);
  const [synkar, setSynkar] = useState(false);

  // localStorage får läsas först efter mount — annars ger servern och klienten
  // olika första rendering.
  useEffect(() => {
    setKal(lasKalibrering());
    setMatning(osynkadMatning());
    setLaddat(true);
  }, []);

  const korSynk = useCallback(async (m: PagaendeMatning) => {
    setSynkar(true);
    const r = await synka(m, medarbetare?.id ?? null);
    setSynkar(false);
    // Mätningen behålls alltid — den bär matning_id och vilka punkter som
    // landat. Bara felet växlar.
    setMatning(r.matning);
    setSynkfel(r.fel);
    return r;
  }, [medarbetare?.id]);

  const matta = matning?.punkter ?? [];
  const kvar = osynkadeAntal(matning);

  if (lage === 'kalibrerar') {
    return (
      <Kalibrering
        onKlar={() => { setKal(lasKalibrering()); setLage('oversikt'); }}
        onAvbryt={() => setLage('oversikt')}
      />
    );
  }

  if (lage === 'sammanfattar' && matning?.matning_id) {
    return (
      <Sammanfattning
        matningId={matning.matning_id}
        traktNamn={trakt?.namn ?? 'Mätning'}
        onStang={() => setLage('oversikt')}
      />
    );
  }

  if (lage === 'valjer') {
    return (
      <Punktval
        onAvbryt={() => setLage('oversikt')}
        onMat={(t, p) => {
          setTrakt(t);
          setPunkt(p);
          // Ny trakt = ny mätning. Byter han trakt mitt i synkas den gamla
          // först, annars skulle punkterna hamna under fel objekt.
          if (!matning || matning.objekt_id !== t.id) {
            if (matning && osynkadeAntal(matning) > 0) void korSynk(matning);
            setMatning(startaMatning(t.id, kal!.relaskop_faktor, kal!.synfalt_grader, enhetsNamn()));
            setSenaste(null);
          }
          setLage('matar');
        }}
      />
    );
  }

  if (lage === 'matar' && kal && punkt) {
    return (
      <Kamera
        punktNummer={punkt.nummer}
        faktor={kal.relaskop_faktor}
        synfaltGrader={kal.synfalt_grader}
        onAvbryt={() => setLage('oversikt')}
        onKlar={(trad: MattTrad[], varv: number) => {
          void (async () => {
            const pos = await hamtaPosition();
            const ny: MattPunkt = {
              punkt_nummer: punkt.nummer,
              lat: punkt.lat,
              lng: punkt.lng,
              matt_lat: pos?.coords.latitude ?? null,
              matt_lng: pos?.coords.longitude ?? null,
              gps_noggrannhet_m: pos?.coords.accuracy ?? null,
              varv_grader: varv,
              matt_tid: new Date().toISOString(),
              trad,
            };
            const bas = matning ?? startaMatning(trakt!.id, kal.relaskop_faktor, kal.synfalt_grader, enhetsNamn());
            const uppdaterad = laggTillPunkt(bas, ny);   // lokalt FÖRST
            setMatning(uppdaterad);
            setSenaste(beskedForPunkt(
              punktGrundyta(ny, kal.relaskop_faktor),
              bas.punkter.map((p) => punktGrundyta(p, kal.relaskop_faktor)),
            ));
            setPunkt(null);
            setLage('oversikt');
            void korSynk(uppdaterad);                    // databasen sedan
          })();
        }}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: T.ff, padding: '16px 16px 120px' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.6, margin: '8px 0 4px' }}>Mätning</h1>
      <p style={{ fontSize: 17, color: '#C7C7CC', margin: '0 0 22px', lineHeight: 1.45 }}>
        Kvarvarande grundyta efter gallring, med telefonen som relaskop.
      </p>

      {!laddat ? (
        <p style={{ fontSize: 17, color: '#C7C7CC' }}>Läser kalibreringen…</p>
      ) : !kal ? (
        <div style={{ background: '#1C1C1E', borderRadius: 16, padding: 18 }}>
          <h2 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 10px' }}>Kalibrera först</h2>
          <p style={{ fontSize: 17, color: '#E5E5EA', lineHeight: 1.5, margin: '0 0 18px' }}>
            Cirkeln på skärmen måste motsvara samma vinkel som ditt relaskop. Utan det
            mäter du systematiskt fel utan att se det. Det tar en minut och görs en gång
            per telefon.
          </p>
          <button
            onClick={() => setLage('kalibrerar')}
            style={{ width: '100%', minHeight: 76, borderRadius: 16, border: 'none',
              background: '#0A84FF', color: '#fff', fontSize: 21, fontWeight: 700 }}
          >
            Kalibrera mot mitt relaskop
          </button>
        </div>
      ) : (
        <>
          {senaste && (
            <div
              style={{
                background: senaste.avvikande ? '#3A2A00' : '#0E2A16',
                border: `2px solid ${senaste.avvikande ? '#FF9F0A' : '#30D158'}`,
                borderRadius: 16, padding: 18, marginBottom: 18,
              }}
            >
              <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>
                {senaste.grundyta} <span style={{ fontSize: 20, fontWeight: 600 }}>m²/ha</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, marginTop: 8, color: '#fff' }}>
                {senaste.rad}
              </div>
            </div>
          )}

          {/* Osynkat är normalläget halva dagen — men det ska SYNAS. */}
          {(kvar > 0 || synkar) && (
            <div
              style={{
                background: '#1C1C1E', border: `2px solid ${synkfel ? '#FF9F0A' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 14, padding: '14px 16px', marginBottom: 14, fontSize: 16, lineHeight: 1.5,
              }}
            >
              {synkar ? (
                <span style={{ color: '#fff' }}>Sparar {kvar} {kvar === 1 ? 'punkt' : 'punkter'}…</span>
              ) : (
                <>
                  <strong style={{ color: '#fff' }}>
                    {kvar} {kvar === 1 ? 'punkt' : 'punkter'} väntar på att sparas
                  </strong>
                  {synkfel && <div style={{ color: '#FF9F0A', marginTop: 4 }}>{synkfel}</div>}
                  <button
                    onClick={() => matning && korSynk(matning)}
                    style={{ width: '100%', minHeight: 60, marginTop: 10, borderRadius: 12, border: 'none',
                      background: 'rgba(255,255,255,0.16)', color: '#fff', fontSize: 17, fontWeight: 600 }}
                  >
                    Försök spara nu
                  </button>
                </>
              )}
            </div>
          )}

          <button
            onClick={() => setLage('valjer')}
            style={{ width: '100%', minHeight: 84, borderRadius: 18, border: 'none',
              background: '#30D158', color: '#04240F', fontSize: 24, fontWeight: 700 }}
          >
            {trakt ? `Mät i ${trakt.namn}` : 'Välj trakt och punkt'}
          </button>

          {/* Sammanfattningen räknas i databasen och kräver därför att punkterna
              ligger där. Står det inte att den väntar på täckning vore knappen
              en återvändsgränd. */}
          {matta.length > 0 && (
            <button
              onClick={() => matning?.matning_id && setLage('sammanfattar')}
              disabled={!matning?.matning_id}
              style={{
                width: '100%', minHeight: 68, marginTop: 12, borderRadius: 16, border: 'none',
                background: matning?.matning_id ? '#0A84FF' : 'rgba(255,255,255,0.10)',
                color: matning?.matning_id ? '#fff' : '#8E8E93',
                fontSize: 19, fontWeight: 700,
              }}
            >
              {matning?.matning_id
                ? `Sammanfattning (${matta.length} ${matta.length === 1 ? 'punkt' : 'punkter'})`
                : 'Sammanfattning — väntar på täckning'}
            </button>
          )}

          {matta.length > 0 && kal && (
            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 14, letterSpacing: 0.6, color: '#C7C7CC', marginBottom: 8 }}>
                MÄTTA PUNKTER
              </div>
              {matta.map((p) => (
                <div
                  key={p.punkt_nummer}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#1C1C1E', borderRadius: 12, padding: '14px 16px', marginBottom: 8,
                    minHeight: 60,
                  }}
                >
                  <span style={{ fontSize: 17 }}>
                    Punkt {p.punkt_nummer}
                    <span style={{ fontSize: 15, color: '#C7C7CC', marginLeft: 8 }}>
                      {p.trad.length} träd
                    </span>
                    {!p.synkad && (
                      <span style={{ fontSize: 15, color: '#C7C7CC', marginLeft: 8 }}>· ej sparad</span>
                    )}
                  </span>
                  <span style={{ fontSize: 19, fontWeight: 700 }}>
                    {Math.round(punktGrundyta(p, kal.relaskop_faktor))} m²/ha
                    {!varvSlutet(p.varv_grader) && (
                      <span style={{ fontSize: 15, color: '#FF9F0A', marginLeft: 10 }}>
                        ofullständigt varv
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Avsluta trakten. Rensar bara när allt ligger i databasen — annars
              vore knappen ett sätt att kasta en dags mätning av misstag. */}
          {matta.length > 0 && (
            <button
              onClick={() => {
                if (avslutaMatning(matning)) {
                  setMatning(null); setTrakt(null); setSenaste(null); setSynkfel(null);
                }
              }}
              disabled={kvar > 0}
              style={{
                width: '100%', minHeight: 60, marginTop: 18, borderRadius: 14, border: 'none',
                background: 'rgba(255,255,255,0.14)',
                color: kvar > 0 ? '#8E8E93' : '#fff', fontSize: 17, fontWeight: 600,
              }}
            >
              {kvar > 0 ? 'Avsluta trakten — spara punkterna först' : 'Avsluta trakten'}
            </button>
          )}

          <button
            onClick={() => setLage('kalibrerar')}
            style={{ width: '100%', minHeight: 60, marginTop: 12, borderRadius: 14, border: 'none',
              background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 17, fontWeight: 600 }}
          >
            Kalibrera om ({kal.synfalt_grader.toFixed(1)}°, faktor {kal.relaskop_faktor})
          </button>
        </>
      )}

      <Link
        href="/"
        style={{ display: 'block', textAlign: 'center', marginTop: 26, color: '#0A84FF',
          fontSize: 17, textDecoration: 'none', minHeight: 60, lineHeight: '60px' }}
      >
        Tillbaka
      </Link>
    </div>
  );
}
