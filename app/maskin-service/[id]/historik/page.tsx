'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const f = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif";
const card = { backgroundColor: '#1c1c1e', borderRadius: 12 } as const;
const labelStyle = { fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: f, fontWeight: 400 as const, letterSpacing: 0.2, margin: 0 };

interface Maskin {
  id: string;
  maskin_id: string;
  namn: string;
  typ: string;
}

interface ServiceEntry {
  id: string;
  maskin_id: string;
  del: string;
  kategori: string;
  beskrivning: string;
  timmar: number | null;
  datum: string;
  skapad_at: string;
}

const KATEGORIER = ['Service', 'Reparation', 'Däck'];
const KATEGORI_MAP: Record<string, string> = {
  'Service': 'service',
  'Reparation': 'ovrigt',
  'Däck': 'punktering',
};
const kategoriValue = (label: string) => KATEGORI_MAP[label] ?? label.toLowerCase();
const KATEGORI_LABEL_MAP: Record<string, string> = {
  'service': 'Service',
  'ovrigt': 'Reparation',
  'punktering': 'Däck',
  'hydraulik': 'Reparation',
  'slang': 'Reparation',
  'motor': 'Reparation',
  'kran': 'Reparation',
  'aggregat': 'Reparation',
  'elektrisk': 'Reparation',
};
const kategoriLabel = (val: string) => KATEGORI_LABEL_MAP[val] ?? val;
const FILTER_TABS = ['Alla', ...KATEGORIER];

export default function HistorikPage() {
  const params = useParams();
  const router = useRouter();
  const maskinId = params.id as string;

  const [maskin, setMaskin] = useState<Maskin | null>(null);
  const [entries, setEntries] = useState<ServiceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Alla');

  const fetchData = useCallback(async () => {
    const [{ data: m }, { data: s }] = await Promise.all([
      supabase.from('maskiner').select('*').eq('id', maskinId).single(),
      supabase.from('maskin_service').select('*').eq('maskin_id', maskinId).order('datum', { ascending: false }),
    ]);
    setMaskin(m);
    setEntries(s || []);
    setLoading(false);
  }, [maskinId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (entry: ServiceEntry) => {
    if (!confirm(`Ta bort "${entry.beskrivning || entry.kategori}"?`)) return;
    await supabase.from('maskin_service').delete().eq('id', entry.id);
    await fetchData();
  };

  const filtered = useMemo(() => {
    let result = entries;
    if (filter !== 'Alla') {
      if (filter === 'Reparation') {
        result = result.filter(e => ['ovrigt','hydraulik','slang','motor','kran','aggregat','elektrisk'].includes(e.kategori));
      } else {
        result = result.filter(e => e.kategori === KATEGORI_MAP[filter]);
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e => e.beskrivning?.toLowerCase().includes(q));
    }
    return result;
  }, [entries, filter, search]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, fontFamily: f }}>Laddar...</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px', paddingBottom: 48 }}>

      {/* Header */}
      <div style={{ padding: '24px 0 24px' }}>
        <button
          onClick={() => router.push(`/maskin-service/${maskinId}`)}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            color: 'rgba(255,255,255,0.4)', fontSize: 15, fontFamily: f,
            marginBottom: 8, display: 'block',
          }}
        >
          ‹ {maskin?.namn || 'Tillbaka'}
        </button>
        <h1 style={{ fontSize: 34, fontWeight: 700, color: '#fff', letterSpacing: -0.5, fontFamily: f, margin: 0 }}>
          Historik
        </h1>
      </div>

      {/* Sökfält */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        backgroundColor: 'rgba(118,118,128,0.24)',
        borderRadius: 10,
        marginBottom: 16,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Sök i beskrivning..."
          style={{
            background: 'none', border: 'none', outline: 'none',
            color: '#fff', fontSize: 16, fontFamily: f,
            width: '100%',
          }}
        />
      </div>

      {/* Filterflikar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {FILTER_TABS.map(tab => {
          const active = filter === tab;
          return (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              style={{
                padding: '6px 14px', borderRadius: 18,
                backgroundColor: active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)',
                border: active ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
                cursor: 'pointer',
                fontSize: 13, fontWeight: active ? 600 : 400,
                color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                fontFamily: f,
                transition: 'all 0.15s',
              }}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Antal träffar */}
      <p style={{ ...labelStyle, fontSize: 12, marginBottom: 12 }}>
        {filtered.length} {filtered.length === 1 ? 'post' : 'poster'}
      </p>

      {/* Listan */}
      <div style={{ ...card, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '24px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.25)', fontFamily: f }}>Inga poster hittades</p>
          </div>
        ) : filtered.map((e, i) => (
          <div key={e.id}>
            {i > 0 && (
              <div style={{ height: 0.5, backgroundColor: 'rgba(255,255,255,0.08)', margin: '0 20px' }} />
            )}
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 3 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#fff', fontFamily: f }}>
                      {kategoriLabel(e.kategori)}
                    </span>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', fontFamily: f }}>
                      {new Date(e.datum).toLocaleDateString('sv-SE')}
                    </span>
                  </div>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', fontFamily: f, margin: '2px 0 0', lineHeight: 1.4 }}>
                    {e.beskrivning || '—'}
                  </p>
                  {e.timmar && (
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', fontFamily: f }}>
                      {e.timmar.toLocaleString('sv-SE')} h
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(e)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12, color: 'rgba(255,255,255,0.15)', fontFamily: f,
                    padding: '4px 0 4px 16px', flexShrink: 0,
                  }}
                >
                  Ta bort
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
