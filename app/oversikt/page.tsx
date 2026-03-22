'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import OversiktMaskiner from './OversiktMaskiner';
import OversiktKarta from './OversiktKarta';
import OversiktGrot from './OversiktGrot';
import { Maskin, MaskinKoItem, OversiktObjekt, TabId, C } from './oversikt-types';
import { globalCss, ff } from './oversikt-styles';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const OBJEKT_SELECT = `id, namn, vo_nummer, typ, atgard, status, volym, areal, lat, lng, ar, manad, bolag, markagare,
  barighet, terrang, skordare_maskin, skordare_band, skordare_band_par, skordare_manuell_fallning, skordare_manuell_fallning_text,
  skotare_maskin, skotare_band, skotare_band_par, skotare_lastreder_breddat, skotare_ris_direkt,
  transport_trailer_in, transport_kommentar, markagare_ska_ha_ved, markagare_ved_text, info_anteckningar,
  faktisk_slut, grot_status, grot_volym, grot_anteckning, grot_deadline, trakt_data`;

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: 'maskiner', label: 'Maskiner', icon: '⚙' },
  { id: 'karta', label: 'Karta', icon: '◎' },
  { id: 'grot', label: 'GROT', icon: '◆' },
];

// Aggregated production per objekt_id: { skordareVol, skotareVol }
export interface ProdAgg {
  skordareVol: number;
  skotareVol: number;
}

/** Fetch all rows with pagination (Supabase default limit is 1000) */
async function fetchAllRows<T>(query: () => any): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data } = await query().range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

export default function OversiktPage() {
  const [activeTab, setActiveTab] = useState<TabId>('karta');
  const [objekt, setObjekt] = useState<OversiktObjekt[]>([]);
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [maskinKo, setMaskinKo] = useState<MaskinKoItem[]>([]);
  const [prodMap, setProdMap] = useState<Record<string, ProdAgg>>({});
  const [grotAnpassad, setGrotAnpassad] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    // Core data — small tables, single fetch
    const [objektRes, maskinerRes, koRes] = await Promise.all([
      supabase.from('objekt').select(OBJEKT_SELECT).order('namn'),
      supabase.from('dim_maskin').select('*').order('modell'),
      supabase.from('maskin_ko').select('*').order('ordning'),
    ]);
    if (objektRes.data) setObjekt(objektRes.data);
    if (maskinerRes.data) setMaskiner(maskinerRes.data);
    if (koRes.data) setMaskinKo(koRes.data);
    setLoading(false);

    // Fetch grot_anpassad from dim_objekt
    const grotRes = await supabase.from('dim_objekt').select('vo_nummer').eq('grot_anpassad', true);
    if (grotRes.data) {
      setGrotAnpassad(new Set(grotRes.data.map((r: { vo_nummer: string }) => r.vo_nummer)));
    }

    // Production data — paginated, can be large
    const [prodRows, lassRows] = await Promise.all([
      fetchAllRows<{ objekt_id: string; volym_m3sub: number }>(
        () => supabase.from('fakt_produktion').select('objekt_id, volym_m3sub')
      ),
      fetchAllRows<{ objekt_id: string; volym_m3sob: number }>(
        () => supabase.from('fakt_lass').select('objekt_id, volym_m3sob')
      ),
    ]);

    const map: Record<string, ProdAgg> = {};
    for (const r of prodRows) {
      if (!r.objekt_id) continue;
      if (!map[r.objekt_id]) map[r.objekt_id] = { skordareVol: 0, skotareVol: 0 };
      map[r.objekt_id].skordareVol += r.volym_m3sub || 0;
    }
    for (const r of lassRows) {
      if (!r.objekt_id) continue;
      if (!map[r.objekt_id]) map[r.objekt_id] = { skordareVol: 0, skotareVol: 0 };
      map[r.objekt_id].skotareVol += r.volym_m3sob || 0;
    }
    setProdMap(map);
  };

  useEffect(() => { fetchAll(); }, []);

  const refreshMaskiner = async () => {
    const [maskinerRes, koRes] = await Promise.all([
      supabase.from('dim_maskin').select('*').order('modell'),
      supabase.from('maskin_ko').select('*').order('ordning'),
    ]);
    if (maskinerRes.data) setMaskiner(maskinerRes.data);
    if (koRes.data) setMaskinKo(koRes.data);
  };

  const refreshObjekt = async () => {
    const res = await supabase.from('objekt').select(OBJEKT_SELECT).order('namn');
    if (res.data) setObjekt(res.data);
  };

  return (
    <div style={{ height: 'calc(100vh - 56px)', width: '100vw', fontFamily: ff, background: C.bg, color: C.t1, overflow: 'hidden', display: 'flex', flexDirection: 'column', WebkitFontSmoothing: 'antialiased' }}>
      <style>{globalCss}</style>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.t3 }}>
          Laddar...
        </div>
      ) : (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, visibility: activeTab === 'karta' ? 'visible' : 'hidden', zIndex: activeTab === 'karta' ? 1 : 0 }}>
            <OversiktKarta objekt={objekt} maskiner={maskiner} maskinKo={maskinKo} prodMap={prodMap} />
          </div>
          <div style={{ position: 'absolute', inset: 0, display: activeTab === 'maskiner' ? 'block' : 'none', overflow: 'auto' }}>
            <OversiktMaskiner
              maskiner={maskiner}
              maskinKo={maskinKo}
              objekt={objekt}
              supabase={supabase}
              onRefresh={refreshMaskiner}
            />
          </div>
          <div style={{ position: 'absolute', inset: 0, display: activeTab === 'grot' ? 'block' : 'none', overflow: 'auto' }}>
            <OversiktGrot
              objekt={objekt}
              grotAnpassadVo={grotAnpassad}
              supabase={supabase}
              onRefresh={refreshObjekt}
            />
          </div>
        </div>
      )}

      {/* Bottom nav — uppföljning-matched tab bar */}
      <div style={{
        flexShrink: 0, background: 'rgba(7,7,8,0.95)', backdropFilter: 'blur(20px)',
        borderTop: `1px solid ${C.borderStrong}`, display: 'flex',
        padding: '4px 0 max(10px, env(safe-area-inset-bottom))', zIndex: 30,
      }}>
        {tabs.map((v) => {
          const active = activeTab === v.id;
          return (
            <button key={v.id} onClick={() => setActiveTab(v.id)}
              style={{
                flex: 1, background: active ? 'rgba(255,255,255,0.06)' : 'none',
                border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '10px 0', minHeight: 52, fontFamily: ff,
                borderRadius: '8px 8px 0 0',
                borderBottom: active ? '2px solid rgba(255,255,255,0.5)' : '2px solid transparent',
                transition: 'all 0.25s',
              }}>
              <span style={{
                fontSize: 18, lineHeight: 1,
                color: active ? C.t1 : C.t3,
                transition: 'color 0.25s',
              }}>{v.icon}</span>
              <span style={{
                fontSize: 12, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase',
                color: active ? C.t1 : C.t3,
                transition: 'color 0.25s',
              }}>{v.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
