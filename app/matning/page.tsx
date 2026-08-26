'use client';

// Mätvyn — ingången.
//
// Steg 1 mäter grundyta och trädslagsfördelning kvar efter gallring. Punkt.
//
// Flödet: välj trakt → tio lottade punkter → gå dit → mät → besked direkt.
// Sammanfattningen över alla punkter kommer i en egen omgång, liksom
// skrivningen till databasen — tabellerna finns ännu inte, så mätningarna
// lever i sidans tillstånd tills migrationen körts.
//
// MÄTNING ÄR SPÄRRAD TILLS ENHETEN KALIBRERATS. Utan kalibrering motsvarar
// cirkeln en gissad vinkel, och då mäter man systematiskt fel utan att se det.
// Spärren är hela poängen med kalibreringsskärmen — tas den bort blir skärmen
// en valfri inställning som ingen öppnar.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { T } from '@/lib/utbildning';
import {
  beskedForPunkt,
  lasKalibrering,
  varvSlutet,
  type Kalibrering as KalTyp,
  type MattTrad,
} from '@/lib/matning/lager';
import Kalibrering from './Kalibrering';
import Kamera from './Kamera';
import Punktval from './Punktval';
import type { Matpunkt } from '@/lib/matning/punkter';

type Trakt = { id: string; namn: string; areal: number | null };
type Lage = 'oversikt' | 'kalibrerar' | 'valjer' | 'matar';

export default function MatningPage() {
  const [lage, setLage] = useState<Lage>('oversikt');
  const [kal, setKal] = useState<KalTyp | null>(null);
  const [laddat, setLaddat] = useState(false);
  const [punkter, setPunkter] = useState<{ nummer: number; grundyta: number; slutet: boolean }[]>([]);
  const [trakt, setTrakt] = useState<Trakt | null>(null);
  const [punkt, setPunkt] = useState<Matpunkt | null>(null);
  const [senaste, setSenaste] = useState<{ rad: string; avvikande: boolean; grundyta: number } | null>(null);

  // Kalibreringen ligger i localStorage och får läsas först efter mount —
  // annars ger servern och klienten olika första rendering.
  useEffect(() => { setKal(lasKalibrering()); setLaddat(true); }, []);

  const punktNummer = punkt?.nummer ?? punkter.length + 1;

  if (lage === 'kalibrerar') {
    return <Kalibrering onKlar={() => { setKal(lasKalibrering()); setLage('oversikt'); }} onAvbryt={() => setLage('oversikt')} />;
  }

  if (lage === 'valjer') {
    return (
      <Punktval
        onAvbryt={() => setLage('oversikt')}
        onMat={(t, p) => { setTrakt(t); setPunkt(p); setLage('matar'); }}
      />
    );
  }

  if (lage === 'matar' && kal) {
    return (
      <Kamera
        punktNummer={punktNummer}
        faktor={kal.relaskop_faktor}
        synfaltGrader={kal.synfalt_grader}
        onAvbryt={() => setLage('oversikt')}
        onKlar={(trad: MattTrad[], varv: number) => {
          const grundyta = trad.length * kal.relaskop_faktor;
          setSenaste({ ...beskedForPunkt(grundyta, punkter.map((p) => p.grundyta)) });
          setPunkter((f) => [...f, { nummer: punktNummer, grundyta, slutet: varvSlutet(varv) }]);
          setLage('oversikt');
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

          <button
            onClick={() => setLage('valjer')}
            style={{ width: '100%', minHeight: 84, borderRadius: 18, border: 'none',
              background: '#30D158', color: '#04240F', fontSize: 24, fontWeight: 700 }}
          >
            {trakt ? `Mät i ${trakt.namn}` : 'Välj trakt och punkt'}
          </button>

          {punkter.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 14, letterSpacing: 0.6, color: '#C7C7CC', marginBottom: 8 }}>
                MÄTTA PUNKTER
              </div>
              {punkter.map((p) => (
                <div
                  key={p.nummer}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#1C1C1E', borderRadius: 12, padding: '14px 16px', marginBottom: 8,
                    minHeight: 60,
                  }}
                >
                  <span style={{ fontSize: 17 }}>Punkt {p.nummer}</span>
                  <span style={{ fontSize: 19, fontWeight: 700 }}>
                    {Math.round(p.grundyta)} m²/ha
                    {!p.slutet && (
                      <span style={{ fontSize: 15, color: '#FF9F0A', marginLeft: 10 }}>ofullständigt varv</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setLage('kalibrerar')}
            style={{ width: '100%', minHeight: 60, marginTop: 18, borderRadius: 14, border: 'none',
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
