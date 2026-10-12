'use client';

// Mätvyn — ingången och flödets nav.
//
// TVÅ ARBETSSÄTT, SAMMA MÄTNING.
//
//   Mät här       — under körning. Martin kliver ur, går bakåt i det han just
//                   gallrat och mäter där han står. Ingen lottning, och inget
//                   beroende på traktgräns eller kartbild.
//   Lotta punkter — efterkontroll av en avslutad trakt. Tio lottade lägen att
//                   beta av, som förut.
//
// Båda skriver till TRAKTENS löpande mätning. Den återupptas så länge den inte
// avslutats, så beskedet jämför mot trakten och inte mot dagens pass — och när
// trakten är klar finns sammanfattningen redan.
//
// PUNKTNUMRET ÄR MÄTNINGENS LÖPANDE ORDNING, inte lottningens. Lottningen
// numrerar sina tio lägen 1..10 som en gångordning; användes de numren rakt av
// skulle en lottad punkt 3 krocka med en mät här-punkt 3 i samma mätning, och
// unique(matning_id, punkt_nummer) avvisa den. Det lottade LÄGET bevaras i
// lat/lng — det är där punkten skulle ha tagits. Där Martin faktiskt stod
// hamnar i matt_lat/matt_lng, alltid.
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

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { T } from '@/lib/utbildning';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import {
  beskedForPunkt,
  enhetsNamn,
  lasKalibrering,
  nastaPunktNummer,
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
  oppnaTrakt,
  osynkadMatning,
  synka,
} from '@/lib/matning/sparande';
import type { Matpunkt } from '@/lib/matning/punkter';
import Kalibrering from './Kalibrering';
import Kamera from './Kamera';
import Punktval from './Punktval';
import Sammanfattning from './Sammanfattning';
import Traktval, { type Trakt } from './Traktval';

type Lage = 'oversikt' | 'kalibrerar' | 'valjer_trakt' | 'lottar' | 'matar' | 'sammanfattar';

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
  const [lottadPunkt, setLottadPunkt] = useState<Matpunkt | null>(null);
  const [senaste, setSenaste] = useState<{ rad: string; avvikande: boolean; grundyta: number } | null>(null);
  const [synkfel, setSynkfel] = useState<string | null>(null);
  const [synkar, setSynkar] = useState(false);
  const [oppnar, setOppnar] = useState(false);
  const [aterupptagen, setAterupptagen] = useState(false);
  const [avslutfel, setAvslutfel] = useState<string | null>(null);
  const [faktorKrock, setFaktorKrock] = useState<number | null>(null);

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
  }, [medarbetare?.id]);

  /** Öppnar trakten: återupptar den löpande mätningen eller startar en ny. */
  const valjTrakt = useCallback(async (t: Trakt, sedan: Lage) => {
    if (!kal) return;
    setOppnar(true);
    try {
      // Byter han trakt med osynkade punkter kvar, synkas de först — annars
      // skulle de hamna under fel objekt.
      if (matning && matning.objekt_id !== t.id && osynkadeAntal(matning) > 0) {
        await korSynk(matning);
      }
      if (matning && matning.objekt_id === t.id) { setLage(sedan); return; }
      const r = await oppnaTrakt(t.id, t.namn, kal.relaskop_faktor, kal.synfalt_grader, enhetsNamn());
      setMatning(r.matning);
      setAterupptagen(r.aterupptagen);
      setFaktorKrock(r.faktorKrock);
      setSenaste(null);
      setAvslutfel(null);
      setLage(sedan);
    } finally {
      setOppnar(false);
    }
  }, [kal, matning, korSynk]);

  const matta = matning?.punkter ?? [];
  const kvar = osynkadeAntal(matning);
  const punktNummer = matning ? nastaPunktNummer(matning) : 1;

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
        traktNamn={matning.objekt_namn}
        onStang={() => setLage('oversikt')}
      />
    );
  }

  if (lage === 'valjer_trakt') {
    return (
      <Traktval
        onAvbryt={() => setLage('oversikt')}
        onValj={(t) => { void valjTrakt(t, 'oversikt'); }}
      />
    );
  }

  if (lage === 'lottar') {
    return (
      <Punktval
        onAvbryt={() => setLage('oversikt')}
        onMat={(t, p) => {
          setLottadPunkt(p);
          void valjTrakt({ id: t.id, namn: t.namn, areal: t.areal }, 'matar');
        }}
      />
    );
  }

  if (lage === 'matar' && kal && matning) {
    return (
      <Kamera
        punktNummer={punktNummer}
        traktNamn={matning.objekt_namn}
        faktor={kal.relaskop_faktor}
        synfaltGrader={kal.synfalt_grader}
        onAvbryt={() => { setLottadPunkt(null); setLage('oversikt'); }}
        onKlar={(trad: MattTrad[], varv: number) => {
          void (async () => {
            const pos = await hamtaPosition();
            const ny: MattPunkt = {
              punkt_nummer: punktNummer,
              // Lottat läge bara när punkten kom ur en lottning. Mät här har
              // inget lottat läge, och att fylla det med GPS-positionen vore
              // att påstå att den lottats där.
              lat: lottadPunkt?.lat ?? null,
              lng: lottadPunkt?.lng ?? null,
              matt_lat: pos?.coords.latitude ?? null,
              matt_lng: pos?.coords.longitude ?? null,
              gps_noggrannhet_m: pos?.coords.accuracy ?? null,
              varv_grader: varv,
              matt_tid: new Date().toISOString(),
              trad,
            };
            const uppdaterad = laggTillPunkt(matning, ny);   // lokalt FÖRST
            setMatning(uppdaterad);
            // Beskedet jämför mot TRAKTEN: tidigare pass ur databasen plus
            // passets egna slutna varv. Bara slutna — ett halvt varv är en
            // underskattning som skulle få nästa punkt att se för hög ut.
            setSenaste(beskedForPunkt(
              punktGrundyta(ny, kal.relaskop_faktor),
              [
                ...matning.tidigare_grundytor,
                ...matning.punkter
                  .filter((p) => varvSlutet(p.varv_grader))
                  .map((p) => punktGrundyta(p, kal.relaskop_faktor)),
              ],
            ));
            setLottadPunkt(null);
            setLage('oversikt');
            void korSynk(uppdaterad);                        // databasen sedan
          })();
        }}
      />
    );
  }

  const knapp: React.CSSProperties = {
    width: '100%', borderRadius: 16, border: 'none', fontSize: 17, fontWeight: 600,
    minHeight: 60, background: 'rgba(255,255,255,0.14)', color: '#fff', fontFamily: T.ff,
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: T.ff, padding: '16px 16px 120px' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.6, margin: '8px 0 4px' }}>Mätning</h1>
      <p style={{ fontSize: 17, color: '#C7C7CC', margin: '0 0 22px', lineHeight: 1.45 }}>
        Kvarvarande grundyta, med telefonen som relaskop.
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
            style={{ ...knapp, minHeight: 76, background: '#0A84FF', fontSize: 21, fontWeight: 700 }}
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

          {/* Vilken trakt. Väljs en gång och gäller resten av passet, så det är
              här det går att upptäcka att man bytt skifte efter lunch utan att
              ha bytt i appen. */}
          {matning && (
            <div style={{ background: '#1C1C1E', borderRadius: 16, padding: '16px 18px', marginBottom: 12 }}>
              <div style={{ fontSize: 14, letterSpacing: 0.6, color: '#C7C7CC' }}>MÄTER I</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '4px 0 2px' }}>
                {matning.objekt_namn}
              </div>
              <div style={{ fontSize: 16, color: '#C7C7CC' }}>
                {matning.db_hogsta_punkt + matta.length > 0
                  ? `${matning.db_hogsta_punkt + matta.length} punkter i mätningen`
                  : 'Inga punkter än'}
                {aterupptagen && matning.db_hogsta_punkt > 0 && ' · återupptagen'}
              </div>
            </div>
          )}

          {/* Trakten hade en pågående mätning med en annan relaskopfaktor. Den
              kunde inte återupptas — grundytan räknas med mätningens faktor, och
              nya punkter i den gamla mätningen hade tyst räknats med den gamla.
              Att bara starta en ny utan att säga det hade gjort att
              sammanfattningen visade halva trakten och såg komplett ut. */}
          {faktorKrock != null && (
            <div
              style={{
                background: '#1C1C1E', border: '2px solid #FF9F0A', borderRadius: 14,
                padding: '14px 16px', marginBottom: 14, fontSize: 16, lineHeight: 1.5,
                color: '#E5E5EA',
              }}
            >
              <strong style={{ color: '#fff', display: 'block', marginBottom: 4 }}>
                Ny mätning startad på trakten
              </strong>
              Trakten har en pågående mätning gjord med faktor {faktorKrock}, och du mäter
              med faktor {kal.relaskop_faktor}. De går inte att blanda — grundytan räknas
              med mätningens faktor. De tidigare punkterna ligger kvar i sin mätning och
              räknas inte med här.
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
                    style={{ ...knapp, marginTop: 10, borderRadius: 12, background: 'rgba(255,255,255,0.16)' }}
                  >
                    Försök spara nu
                  </button>
                </>
              )}
            </div>
          )}

          {/* Huvudhandlingen: mät där du står. */}
          <button
            onClick={() => (matning ? setLage('matar') : setLage('valjer_trakt'))}
            disabled={oppnar}
            style={{
              ...knapp, minHeight: 96, borderRadius: 18, background: '#30D158',
              color: '#04240F', fontSize: 26, fontWeight: 700,
            }}
          >
            {oppnar ? 'Öppnar trakten…' : matning ? 'Mät här' : 'Välj trakt och mät'}
          </button>

          {matning && (
            <button onClick={() => setLage('valjer_trakt')} style={{ ...knapp, marginTop: 10 }}>
              Byt trakt
            </button>
          )}

          {/* Efterkontrollen finns kvar — det är ett annat arbetssätt, inte ett
              sämre. Lottade lägen kräver inritad gräns och kartbild. */}
          <button onClick={() => setLage('lottar')} style={{ ...knapp, marginTop: 10 }}>
            Lotta tio punkter (efterkontroll)
          </button>

          {matning?.matning_id && (
            <button
              onClick={() => setLage('sammanfattar')}
              style={{ ...knapp, marginTop: 10, background: '#0A84FF', fontSize: 19, fontWeight: 700, minHeight: 68 }}
            >
              Sammanfattning
            </button>
          )}
          {matning && !matning.matning_id && matta.length > 0 && (
            <button disabled style={{ ...knapp, marginTop: 10, background: 'rgba(255,255,255,0.10)', color: '#8E8E93' }}>
              Sammanfattning — väntar på täckning
            </button>
          )}

          {matta.length > 0 && kal && (
            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 14, letterSpacing: 0.6, color: '#C7C7CC', marginBottom: 8 }}>
                MÄTT I DET HÄR PASSET
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

          {/* Avsluta trakten STÄNGER den löpande mätningen. Först då börjar
              nästa besök en ny — annars skulle en gallring i höst fortsätta
              fylla på en mätning från i våras. */}
          {matning && (
            <>
              <button
                onClick={() => {
                  void (async () => {
                    const r = await avslutaMatning(matning);
                    if (r.status === 'avslutad') {
                      setMatning(null); setSenaste(null); setSynkfel(null);
                      setAterupptagen(false); setAvslutfel(null); setFaktorKrock(null);
                    } else if (r.status === 'osynkat') {
                      setAvslutfel(`${r.kvar} ${r.kvar === 1 ? 'punkt väntar' : 'punkter väntar'} på att sparas.`);
                    } else {
                      setAvslutfel(r.meddelande);
                    }
                  })();
                }}
                disabled={kvar > 0}
                style={{ ...knapp, marginTop: 18, color: kvar > 0 ? '#8E8E93' : '#fff' }}
              >
                {kvar > 0 ? 'Avsluta trakten — spara punkterna först' : 'Avsluta trakten'}
              </button>
              {avslutfel && (
                <div style={{ fontSize: 16, color: '#FF9F0A', marginTop: 8, lineHeight: 1.45 }}>
                  {avslutfel}
                </div>
              )}
            </>
          )}

          <button onClick={() => setLage('kalibrerar')} style={{ ...knapp, marginTop: 12 }}>
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
