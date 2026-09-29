'use client';

// Steg 1 och 2 i flödet: välj trakt, lotta tio punkter, gå dit.
//
// PUNKTERNA LOTTAS EN GÅNG. Det finns med avsikt ingen knapp som lottar om.
// Kan man trycka tills lägena ser bra ut är slumpen borta, och då mäter man
// sin egen känsla i stället för trakten. Samma regel som egenkontrollens
// provytor.
//
// AVSTÅNDET SÄGS I ORD OCH METER, aldrig i gradtal. GPS under krontak är
// 5-15 m; en bäring med decimalprecision från ett läge som är plus minus tio
// meter ser exakt ut men ljuger. Under 15 m slutar riktningen sägas alls —
// sista biten är ögat, inte telefonen.

import { useCallback, useEffect, useState } from 'react';
import { T } from '@/lib/utbildning';
import { supabase } from '@/lib/supabase';
import {
  FRAMME_M,
  forklaring,
  lottaMatpunkter,
  medAvstand,
  type Matpunkt,
  type PunktMedAvstand,
} from '@/lib/matning/punkter';

type Trakt = { id: string; namn: string; areal: number | null };

export default function Punktval({
  onMat,
  onAvbryt,
}: {
  onMat: (trakt: Trakt, punkt: Matpunkt) => void;
  onAvbryt: () => void;
}) {
  const [trakter, setTrakter] = useState<Trakt[] | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [vald, setVald] = useState<Trakt | null>(null);
  const [punkter, setPunkter] = useState<Matpunkt[] | null>(null);
  const [punktFel, setPunktFel] = useState<string | null>(null);
  const [lottar, setLottar] = useState(false);
  const [min, setMin] = useState<{ lat: number; lng: number; noggrannhet: number | null } | null>(null);

  // Gallringar — mätningen görs i ett gallrat bestånd.
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('objekt')
        .select('id, namn, areal, typ')
        .eq('typ', 'gallring')
        .order('namn');
      if (error) { setFel(error.message); return; }
      setTrakter((data ?? []).map((o) => ({ id: o.id, namn: o.namn ?? 'Namnlös', areal: o.areal })));
    })();
  }, []);

  // Positionen. Nekas den visas punkterna ändå — utan avstånd, och det sägs.
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setMin({ lat: p.coords.latitude, lng: p.coords.longitude, noggrannhet: p.coords.accuracy ?? null }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const lotta = useCallback(async (t: Trakt) => {
    setVald(t); setPunkter(null); setPunktFel(null); setLottar(true);
    try {
      const r = await lottaMatpunkter(t.id);
      if (r.status === 'ok') setPunkter(r.punkter);
      else setPunktFel(r.status === 'fel' ? r.meddelande : forklaring(r.status));
    } catch (e) {
      setPunktFel(e instanceof Error ? e.message : 'Punkterna kunde inte lottas.');
    } finally {
      setLottar(false);
    }
  }, []);

  const rutan: React.CSSProperties = {
    background: '#1C1C1E', borderRadius: 16, padding: 18, marginBottom: 12,
    fontSize: 17, lineHeight: 1.5, color: '#E5E5EA',
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: T.ff, padding: '16px 16px 120px' }}>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.5, margin: '8px 0 16px' }}>
        {vald ? vald.namn : 'Välj trakt'}
      </h1>

      {/* Trakter */}
      {!vald && (
        <>
          {fel && <div style={rutan}>Kunde inte läsa trakterna: {fel}</div>}
          {!fel && trakter === null && <div style={rutan}>Hämtar gallringar…</div>}
          {!fel && trakter?.length === 0 && (
            <div style={rutan}>
              Inga gallringar hittades. Mätningen görs i ett gallrat bestånd, så listan fylls
              av objekt med åtgärd gallring.
            </div>
          )}
          {trakter?.map((t) => (
            <button
              key={t.id}
              onClick={() => lotta(t)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', minHeight: 72,
                background: '#1C1C1E', border: 'none', borderRadius: 14, color: '#fff',
                padding: '14px 16px', marginBottom: 8, fontSize: 18, fontFamily: T.ff,
              }}
            >
              {t.namn}
              {t.areal != null && (
                <span style={{ display: 'block', fontSize: 15, color: '#C7C7CC', marginTop: 3 }}>
                  {t.areal} ha
                </span>
              )}
            </button>
          ))}
        </>
      )}

      {/* Punkterna */}
      {vald && (
        <>
          {lottar && <div style={rutan}>Lottar punkter…</div>}

          {punktFel && (
            <div style={{ ...rutan, border: '2px solid #FF9F0A' }}>
              <strong style={{ color: '#fff', display: 'block', marginBottom: 6 }}>
                Punkterna kunde inte läggas ut
              </strong>
              {punktFel}
            </div>
          )}

          {punkter && (
            <>
              <p style={{ fontSize: 16, color: '#C7C7CC', margin: '0 0 6px', lineHeight: 1.45 }}>
                {punkter.length} punkter, lottade en gång. 20 m från gränsen, 30 m mellan varandra.
              </p>
              {!min && (
                <p style={{ fontSize: 16, color: '#FF9F0A', margin: '0 0 14px' }}>
                  Ingen position — avstånden kan inte visas.
                </p>
              )}
              {min?.noggrannhet != null && min.noggrannhet > 20 && (
                <p style={{ fontSize: 16, color: '#FF9F0A', margin: '0 0 14px' }}>
                  GPS-osäkerhet ±{Math.round(min.noggrannhet)} m — avstånden är ungefärliga.
                </p>
              )}

              {medAvstand(punkter, min).map((p) => (
                <PunktRad key={p.nummer} punkt={p} onValj={() => onMat(vald, p)} />
              ))}
            </>
          )}

          <button
            onClick={() => { setVald(null); setPunkter(null); setPunktFel(null); }}
            style={{
              width: '100%', minHeight: 64, marginTop: 16, borderRadius: 14, border: 'none',
              background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 17, fontWeight: 600,
            }}
          >
            Byt trakt
          </button>
        </>
      )}

      <button
        onClick={onAvbryt}
        style={{
          width: '100%', minHeight: 64, marginTop: 10, borderRadius: 14, border: 'none',
          background: 'transparent', color: '#0A84FF', fontSize: 17, fontWeight: 600,
        }}
      >
        Tillbaka
      </button>
    </div>
  );
}

function PunktRad({ punkt, onValj }: { punkt: PunktMedAvstand; onValj: () => void }) {
  const framme = punkt.avstand_m != null && punkt.avstand_m <= FRAMME_M;
  return (
    <button
      onClick={onValj}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
        minHeight: 72, background: framme ? '#0E2A16' : '#1C1C1E',
        border: framme ? '2px solid #30D158' : 'none',
        borderRadius: 14, color: '#fff', padding: '14px 16px', marginBottom: 8,
        fontSize: 18, fontFamily: 'inherit', textAlign: 'left',
      }}
    >
      <span style={{ fontWeight: 600 }}>Punkt {punkt.nummer}</span>
      <span style={{ fontSize: 17, color: framme ? '#30D158' : '#C7C7CC', fontWeight: 600 }}>
        {punkt.avstand_m == null
          ? 'avstånd okänt'
          : framme
            // Under 15 m säger vi inte längre åt vilket håll. Felet i GPS:en är
            // då större än avståndet, och en riktning vore en gissning.
            ? 'Du är framme'
            : `${punkt.kompass}, ${punkt.avstand_m} m`}
      </span>
    </button>
  );
}
