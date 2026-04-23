'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface Maskin {
  id: string;
  maskin_id: string;
  namn: string;
  typ: string;
  marke: string;
  modell: string;
  aktiv: boolean;
}

const fonts = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif";

const formatTyp = (typ: string) => {
  const map: Record<string, string> = {
    skordare: 'Skördare',
    skotare: 'Skotare',
  };
  return map[typ.toLowerCase()] ?? typ.charAt(0).toUpperCase() + typ.slice(1);
};

export default function MaskinServicePage() {
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data: m } = await supabase.from('maskiner').select('*').eq('aktiv', true).order('namn');
    setMaskiner(m || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = maskiner.filter(m =>
    !search || m.namn.toLowerCase().includes(search.toLowerCase()) ||
    m.typ?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 24px', paddingBottom: 40 }}>
      <style>{`@keyframes skelShine { 0% { background-position: -200px 0; } 100% { background-position: calc(200px + 100%) 0; } }
        .skel { background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.04) 100%); background-size: 200px 100%; border-radius: 8px; animation: skelShine 1.4s ease-in-out infinite; }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '28px 0 20px' }}>
        <h1 style={{ fontSize: 34, fontWeight: 700, color: '#fff', letterSpacing: -0.4, fontFamily: fonts, margin: 0 }}>Servicelogg</h1>
      </div>
      <div className="skel" style={{ height: 44, marginBottom: 28 }} />
      {[1, 2].map(i => (
        <div key={i} style={{ marginBottom: 24 }}>
          <div className="skel" style={{ height: 14, width: 120, marginBottom: 12 }} />
          <div style={{ backgroundColor: '#1c1c1e', borderRadius: 12, padding: '4px 0' }}>
            {[1, 2, 3].map(j => (
              <div key={j} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: j < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div className="skel" style={{ height: 17, width: '50%' }} />
                <div className="skel" style={{ height: 13, width: 40 }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 24px', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '28px 0 20px' }}>
        <h1 style={{ fontSize: 34, fontWeight: 700, color: '#fff', letterSpacing: -0.4, fontFamily: fonts, margin: 0 }}>
          Servicelogg
        </h1>
      </div>

      {/* Sökfält */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        backgroundColor: 'rgba(118,118,128,0.24)',
        borderRadius: 10,
        marginBottom: 28,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Sök"
          style={{
            background: 'none', border: 'none', outline: 'none',
            color: '#fff', fontSize: 16, fontFamily: fonts,
            width: '100%',
          }}
        />
      </div>

      {/* Maskiner grupperade efter typ */}
      {filtered.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', fontFamily: fonts }}>Inga maskiner hittades</p>
        </div>
      ) : (
        Object.entries(
          filtered.reduce<Record<string, Maskin[]>>((groups, m) => {
            const typ = m.typ || 'Övrigt';
            (groups[typ] = groups[typ] || []).push(m);
            return groups;
          }, {})
        ).map(([typ, machines]) => (
          <div key={typ} style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: '#fff', letterSpacing: -0.3, fontFamily: fonts, margin: '0 0 10px' }}>
              {formatTyp(typ)}
            </h2>
            <div style={{ backgroundColor: '#1c1c1e', borderRadius: 12, overflow: 'hidden' }}>
              {machines.map((m, i) => (
                <div key={m.id}>
                  {i > 0 && (
                    <div style={{ height: 0.5, backgroundColor: 'rgba(255,255,255,0.08)', margin: '0 20px' }} />
                  )}
                  <Link href={`/maskin-service/${m.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '16px 20px',
                      cursor: 'pointer',
                    }}>
                      <span style={{ fontSize: 17, fontWeight: 600, color: '#fff', letterSpacing: -0.2, fontFamily: fonts }}>
                        {m.namn}
                      </span>
                      <span style={{ fontSize: 17, color: 'rgba(255,255,255,0.25)', fontFamily: fonts }}>›</span>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
