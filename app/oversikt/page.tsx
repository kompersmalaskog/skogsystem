'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Navigation from '../components/Navigation';
import OversiktMaskiner from './OversiktMaskiner';
import OversiktObjektLista from './OversiktObjektLista';
import OversiktKarta from './OversiktKarta';
import OversiktGrot from './OversiktGrot';
import { Maskin, MaskinKoItem, OversiktObjekt, TabId } from './oversikt-types';
import { pageStyle, headerStyle, headerSubtitle, headerTitle, tabBarStyle, tabButton } from './oversikt-styles';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const tabs: { id: TabId; label: string }[] = [
  { id: 'maskiner', label: 'Maskiner' },
  { id: 'objekt', label: 'Objekt' },
  { id: 'karta', label: 'Karta' },
  { id: 'grot', label: 'GROT' },
];

export default function OversiktPage() {
  const [activeTab, setActiveTab] = useState<TabId>('maskiner');
  const [objekt, setObjekt] = useState<OversiktObjekt[]>([]);
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [maskinKo, setMaskinKo] = useState<MaskinKoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    const [objektRes, maskinerRes, koRes] = await Promise.all([
      supabase.from('objekt').select('id, namn, typ, status, volym, areal, lat, lng, ar, manad, bolag, markagare, grot_status, grot_volym, grot_anteckning').order('namn'),
      supabase.from('maskiner').select('*').order('namn'),
      supabase.from('maskin_ko').select('*').order('ordning'),
    ]);

    if (objektRes.data) setObjekt(objektRes.data);
    if (maskinerRes.data) setMaskiner(maskinerRes.data);
    if (koRes.data) setMaskinKo(koRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const refreshMaskiner = async () => {
    const [maskinerRes, koRes] = await Promise.all([
      supabase.from('maskiner').select('*').order('namn'),
      supabase.from('maskin_ko').select('*').order('ordning'),
    ]);
    if (maskinerRes.data) setMaskiner(maskinerRes.data);
    if (koRes.data) setMaskinKo(koRes.data);
  };

  const refreshObjekt = async () => {
    const res = await supabase.from('objekt').select('id, namn, typ, status, volym, areal, lat, lng, ar, manad, bolag, markagare, grot_status, grot_volym, grot_anteckning').order('namn');
    if (res.data) setObjekt(res.data);
  };

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={headerStyle}>
          <div style={headerSubtitle}>KOMPERSMÅLA SKOG</div>
          <div style={headerTitle}>Översikt</div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
          Laddar...
        </div>
        <Navigation />
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={headerSubtitle}>KOMPERSMÅLA SKOG</div>
        <div style={headerTitle}>Översikt</div>
      </div>

      {/* Tab bar */}
      <div style={tabBarStyle}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={tabButton(activeTab === t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'maskiner' && (
          <OversiktMaskiner
            maskiner={maskiner}
            maskinKo={maskinKo}
            objekt={objekt}
            supabase={supabase}
            onRefresh={refreshMaskiner}
          />
        )}
        {activeTab === 'objekt' && (
          <OversiktObjektLista objekt={objekt} />
        )}
        {activeTab === 'karta' && (
          <OversiktKarta objekt={objekt} />
        )}
        {activeTab === 'grot' && (
          <OversiktGrot
            objekt={objekt}
            supabase={supabase}
            onRefresh={refreshObjekt}
          />
        )}
      </div>

      <Navigation />
    </div>
  );
}
