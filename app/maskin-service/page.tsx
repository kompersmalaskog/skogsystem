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

interface ServicePaminnelse {
  id: string;
  maskin_id: string;
  typ: string;
  intervall_timmar: number;
  senast_utford_timmar: number;
}

export default function MaskinServicePage() {
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [maskinTimmar, setMaskinTimmar] = useState<Record<string, number>>({});
  const [paminnelser, setPaminnelser] = useState<ServicePaminnelse[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [{ data: m }, { data: skift }, { data: pam }] = await Promise.all([
      supabase.from('maskiner').select('*').eq('aktiv', true).order('namn'),
      supabase.from('fakt_skift').select('maskin_id, langd_sek'),
      supabase.from('service_paminnelser').select('*').eq('aktiv', true),
    ]);

    setMaskiner(m || []);
    setPaminnelser(pam || []);

    if (skift) {
      const map: Record<string, number> = {};
      for (const r of skift) map[r.maskin_id] = (map[r.maskin_id] || 0) + (r.langd_sek || 0);
      for (const k in map) map[k] = Math.round(map[k] / 3600);
      setMaskinTimmar(map);
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getServiceStatus = (m: Maskin) => {
    const timmar = maskinTimmar[m.maskin_id] || 0;
    const pam = paminnelser.find(p => p.maskin_id === m.id);
    if (!pam) return `${timmar.toLocaleString('sv-SE')} drifttimmar`;
    const nastaService = pam.senast_utford_timmar + pam.intervall_timmar;
    const kvar = nastaService - timmar;
    if (kvar <= 0) return `Service försenad ${Math.abs(kvar)} h`;
    return `Service om ${kvar} h`;
  };

  const filtered = maskiner.filter(m =>
    !search || m.namn.toLowerCase().includes(search.toLowerCase()) ||
    m.typ?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: fonts }}>Laddar...</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 24px', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '28px 0 20px' }}>
        <h1 style={{ fontSize: 34, fontWeight: 700, color: '#fff', letterSpacing: -0.4, fontFamily: fonts, margin: 0 }}>
          Service
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
        <span style={{ fontSize: 15, opacity: 0.4 }}>🔍</span>
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
              {typ}
            </h2>
            <div style={{ backgroundColor: '#1C1C1E', borderRadius: 16, overflow: 'hidden' }}>
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 17, fontWeight: 600, color: '#fff', letterSpacing: -0.2, fontFamily: fonts }}>
                          {m.namn}
                        </span>
                        <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', fontFamily: fonts }}>
                          {getServiceStatus(m)}
                        </span>
                      </div>
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

const fonts = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif";
