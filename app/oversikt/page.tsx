'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import OversiktMaskiner from './OversiktMaskiner';
import OversiktObjektLista from './OversiktObjektLista';
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
  kontakt_namn, kontakt_telefon, trailer_behovs, ovrigt_info,
  faktisk_slut, grot_status, grot_volym, grot_anteckning, grot_deadline`;

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: 'karta', label: 'Karta', icon: '◎' },
  { id: 'objekt', label: 'Objekt', icon: '☰' },
  { id: 'maskiner', label: 'Maskiner', icon: '⚙' },
  { id: 'grot', label: 'GROT', icon: '◆' },
];

export default function OversiktPage() {
  const [activeTab, setActiveTab] = useState<TabId>('karta');
  const [objekt, setObjekt] = useState<OversiktObjekt[]>([]);
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [maskinKo, setMaskinKo] = useState<MaskinKoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    const [objektRes, maskinerRes, koRes] = await Promise.all([
      supabase.from('objekt').select(OBJEKT_SELECT).order('namn'),
      supabase.from('dim_maskin').select('*').order('modell'),
      supabase.from('maskin_ko').select('*').order('ordning'),
    ]);
    if (objektRes.data) setObjekt(objektRes.data);
    if (maskinerRes.data) setMaskiner(maskinerRes.data);
    if (koRes.data) setMaskinKo(koRes.data);
    setLoading(false);
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
          {activeTab === 'karta' && (
            <OversiktKarta objekt={objekt} maskiner={maskiner} maskinKo={maskinKo} />
          )}
          {activeTab === 'objekt' && (
            <OversiktObjektLista objekt={objekt} />
          )}
          {activeTab === 'maskiner' && (
            <OversiktMaskiner
              maskiner={maskiner}
              maskinKo={maskinKo}
              objekt={objekt}
              supabase={supabase}
              onRefresh={refreshMaskiner}
            />
          )}
          {activeTab === 'grot' && (
            <OversiktGrot
              objekt={objekt}
              supabase={supabase}
              onRefresh={refreshObjekt}
            />
          )}
        </div>
      )}

      {/* Bottom nav */}
      <div style={{
        flexShrink: 0, background: 'rgba(17,17,16,0.95)', backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex',
        padding: '8px 0 max(14px, env(safe-area-inset-bottom))', zIndex: 30,
      }}>
        {tabs.map((v) => {
          const active = activeTab === v.id;
          return (
            <button key={v.id} onClick={() => setActiveTab(v.id)}
              style={{
                flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '6px 0', fontFamily: ff, transition: 'all 0.15s',
              }}>
              <span style={{
                fontSize: 20, lineHeight: 1,
                color: active ? '#e8e8e4' : '#3a3a36',
                transition: 'color 0.15s',
              }}>{v.icon}</span>
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '-0.2px',
                color: active ? '#e8e8e4' : '#3a3a36',
                transition: 'color 0.15s',
              }}>{v.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
