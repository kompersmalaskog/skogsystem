'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const C = {
  bg: '#09090b', card: '#131315', border: 'rgba(255,255,255,0.06)',
  t1: '#fafafa', t2: 'rgba(255,255,255,0.7)', t3: 'rgba(255,255,255,0.45)', t4: 'rgba(255,255,255,0.2)',
  green: '#22c55e', blue: '#3b82f6',
};
const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif";

interface DimObjekt {
  objekt_id: string;
  object_name: string | null;
  vo_nummer: string | null;
  skogsagare: string | null;
  bolag: string | null;
}

interface Tilldelat {
  objekt_id: string;
  object_name: string;
  vo_nummer: string;
}

export default function StartaJobbPage() {
  const [objekt, setObjekt] = useState<DimObjekt[]>([]);
  const [sok, setSok] = useState('');
  const [tilldelat, setTilldelat] = useState<Tilldelat | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        setError('Timeout: inget svar från databasen efter 10 sekunder');
        setLoading(false);
      }
    }, 10000);

    (async () => {
      try {
        const { data, error: dbErr } = await supabase
          .from('dim_objekt')
          .select('objekt_id, object_name, vo_nummer, skogsagare, bolag')
          .is('vo_nummer', null)
          .order('object_name');
        if (dbErr) {
          console.error('Supabase error:', dbErr);
          setError(`Databasfel: ${dbErr.message}`);
        } else {
          console.log(`Hämtade ${data?.length ?? 0} objekt (debug: alla)`);
          if (data) setObjekt(data);
        }
      } catch (err: any) {
        console.error('Fetch error:', err);
        setError(`Nätverksfel: ${err.message}`);
      }
      setLoading(false);
      clearTimeout(timeout);
    })();

    return () => clearTimeout(timeout);
  }, []);

  const lista = useMemo(() => {
    if (!sok.trim()) return objekt;
    const t = sok.toLowerCase();
    return objekt.filter(o =>
      (o.object_name || '').toLowerCase().includes(t) ||
      (o.skogsagare || '').toLowerCase().includes(t) ||
      (o.bolag || '').toLowerCase().includes(t)
    );
  }, [objekt, sok]);

  const handleTilldela = async (obj: DimObjekt) => {
    if (saving) return;
    setSaving(true);

    const { data: vo } = await supabase.rpc('next_privat_vo');
    if (!vo) { setSaving(false); return; }

    await supabase
      .from('dim_objekt')
      .update({ vo_nummer: vo })
      .eq('objekt_id', obj.objekt_id);

    setObjekt(prev => prev.filter(o => o.objekt_id !== obj.objekt_id));
    setTilldelat({
      objekt_id: obj.objekt_id,
      object_name: obj.object_name || obj.objekt_id,
      vo_nummer: vo,
    });
    setSaving(false);
  };

  const handleKlar = () => {
    setTilldelat(null);
  };

  // Resultatvy efter tilldelning
  if (tilldelat) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: C.bg, color: C.t1, fontFamily: ff, WebkitFontSmoothing: 'antialiased', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ fontSize: 14, color: C.t3, marginBottom: 8 }}>{tilldelat.object_name}</div>
        <div style={{ fontSize: 15, color: C.t2, marginBottom: 24 }}>Mata in detta nummer i terminalen:</div>
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-1px', marginBottom: 40, color: C.green }}>{tilldelat.vo_nummer}</div>
        <button
          onClick={handleKlar}
          style={{
            padding: '16px 48px', borderRadius: 14, border: 'none',
            background: C.green, color: '#000', fontSize: 17, fontWeight: 600,
            cursor: 'pointer', fontFamily: ff,
          }}
        >
          Klar
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg, color: C.t1, fontFamily: ff, WebkitFontSmoothing: 'antialiased', overflowY: 'auto' }}>
      <div style={{ padding: '24px 20px 0' }}>
        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 20 }}>Starta jobb</div>

        {/* Sök */}
        <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 16px', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 16, color: C.t3 }}>⌕</span>
          <input
            type="text"
            placeholder="Sök objekt, ägare..."
            value={sok}
            onChange={e => setSok(e.target.value)}
            style={{ flex: 1, border: 'none', background: 'none', fontSize: 16, color: C.t1, outline: 'none', fontFamily: ff }}
          />
          {sok && (
            <button onClick={() => setSok('')} style={{ background: C.t3, border: 'none', color: C.bg, width: 20, height: 20, borderRadius: '50%', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          )}
        </div>

        <div style={{ fontSize: 12, color: C.t3, marginBottom: 16 }}>
          {lista.length} objekt utan VO-nummer
        </div>
      </div>

      {/* Lista */}
      <div style={{ padding: '0 16px 120px', maxWidth: 700, margin: '0 auto' }}>
        {error ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: .3 }}>⚠</div>
            <div style={{ fontSize: 15, color: '#ef4444', marginBottom: 16 }}>{error}</div>
            <button onClick={() => window.location.reload()} style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: C.green, color: '#000', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>Försök igen</button>
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: C.t3 }}>
            <div style={{ fontSize: 15 }}>Laddar...</div>
          </div>
        ) : lista.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: C.t3 }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: .3 }}>✓</div>
            <div style={{ fontSize: 15 }}>Alla objekt har VO-nummer</div>
          </div>
        ) : (
          lista.map(obj => (
            <div
              key={obj.objekt_id}
              onClick={() => handleTilldela(obj)}
              style={{
                background: C.card, borderRadius: 16, padding: '18px 18px',
                cursor: saving ? 'wait' : 'pointer', marginBottom: 10,
                border: '1px solid ' + C.border, transition: 'transform 0.1s',
                opacity: saving ? 0.5 : 1,
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px', marginBottom: 4 }}>
                {obj.object_name || obj.objekt_id}
              </div>
              <div style={{ fontSize: 12, color: C.t3 }}>
                {[obj.skogsagare, obj.bolag].filter(Boolean).join(' · ') || 'Okänd ägare'}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
