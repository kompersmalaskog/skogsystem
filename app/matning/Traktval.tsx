'use client';

// Välj trakt för mätning under körning.
//
// SKILT FRÅN PUNKTVAL. Punktvalet lottar tio punkter och kräver både inritad
// traktgräns och kartbild — rimligt för efterkontroll av en avslutad trakt,
// omöjligt när Martin kliver ur maskinen mitt i en gallring. Den här vyn
// väljer bara trakten. Inga beroenden alls.
//
// VALET GÖRS EN GÅNG per pass, och sedan är "Mät här" ett tryck. Därför är det
// också den här vyn som avgör om han står på rätt trakt efter lunch — och
// därför skriks traktnamnet ut på mätskärmen efteråt, inte bara här.

import { useEffect, useState } from 'react';
import { T } from '@/lib/utbildning';
import { supabase } from '@/lib/supabase';

export type Trakt = { id: string; namn: string; areal: number | null };

export default function Traktval({
  onValj,
  onAvbryt,
}: {
  onValj: (trakt: Trakt) => void;
  onAvbryt: () => void;
}) {
  const [trakter, setTrakter] = useState<Trakt[] | null>(null);
  const [fel, setFel] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Ingen statusfilter. Mätning under körning sker per definition på en
      // trakt som INTE är avslutad, så en grind på skördningsstatus hade
      // stängt ute precis det här arbetssättet.
      const { data, error } = await supabase
        .from('objekt')
        .select('id, namn, areal, typ')
        .eq('typ', 'gallring')
        .order('namn');
      if (error) { setFel(error.message); return; }
      setTrakter((data ?? []).map((o) => ({ id: o.id, namn: o.namn ?? 'Namnlös', areal: o.areal })));
    })();
  }, []);

  const rutan: React.CSSProperties = {
    background: '#1C1C1E', borderRadius: 16, padding: 18, marginBottom: 12,
    fontSize: 17, lineHeight: 1.5, color: '#E5E5EA',
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: T.ff, padding: '16px 16px 120px' }}>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.5, margin: '8px 0 4px' }}>
        Vilken trakt?
      </h1>
      <p style={{ fontSize: 16, color: '#C7C7CC', margin: '0 0 18px', lineHeight: 1.45 }}>
        Väljs en gång. Sen är Mät här ett tryck.
      </p>

      {fel && <div style={{ ...rutan, border: '2px solid #FF9F0A' }}>Kunde inte läsa trakterna: {fel}</div>}
      {!fel && trakter === null && <div style={rutan}>Hämtar gallringar…</div>}
      {!fel && trakter?.length === 0 && (
        <div style={rutan}>
          Inga gallringar hittades. Listan fylls av objekt med åtgärd gallring.
        </div>
      )}

      {trakter?.map((t) => (
        <button
          key={t.id}
          onClick={() => onValj(t)}
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
