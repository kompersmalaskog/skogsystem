'use client';

import React, { useState } from 'react';
import { Maskin, MaskinKoItem, OversiktObjekt } from './oversikt-types';
import { cardStyle, pillButton, inputStyle, modalOverlay, modalContent } from './oversikt-styles';
import { formatVolym } from './oversikt-utils';

interface Props {
  maskiner: Maskin[];
  maskinKo: MaskinKoItem[];
  objekt: OversiktObjekt[];
  supabase: any;
  onRefresh: () => Promise<void>;
}

export default function OversiktMaskiner({ maskiner, maskinKo, objekt, supabase, onRefresh }: Props) {
  const [showAddMaskin, setShowAddMaskin] = useState(false);
  const [newNamn, setNewNamn] = useState('');
  const [newTyp, setNewTyp] = useState<'skördare' | 'skotare'>('skördare');
  const [newModell, setNewModell] = useState('');
  const [addingToMaskin, setAddingToMaskin] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAddMaskin = async () => {
    if (!newNamn.trim()) return;
    setSaving(true);
    await supabase.from('maskiner').insert({
      namn: newNamn.trim(),
      typ: newTyp,
      modell: newModell.trim() || null,
    });
    setNewNamn('');
    setNewModell('');
    setShowAddMaskin(false);
    setSaving(false);
    await onRefresh();
  };

  const handleDeleteMaskin = async (id: string) => {
    if (!confirm('Ta bort maskinen och hela dess kö?')) return;
    await supabase.from('maskiner').delete().eq('id', id);
    await onRefresh();
  };

  const handleAddToKo = async (maskinId: string, objektId: string) => {
    const existing = maskinKo.filter(k => k.maskin_id === maskinId);
    const maxOrdning = existing.length > 0 ? Math.max(...existing.map(k => k.ordning)) : -1;
    await supabase.from('maskin_ko').insert({
      maskin_id: maskinId,
      objekt_id: objektId,
      ordning: maxOrdning + 1,
    });
    setAddingToMaskin(null);
    setSearchText('');
    await onRefresh();
  };

  const handleRemoveFromKo = async (koId: string) => {
    await supabase.from('maskin_ko').delete().eq('id', koId);
    await onRefresh();
  };

  const handleMoveUp = async (maskinId: string, koItem: MaskinKoItem) => {
    const items = maskinKo
      .filter(k => k.maskin_id === maskinId)
      .sort((a, b) => a.ordning - b.ordning);
    const idx = items.findIndex(k => k.id === koItem.id);
    if (idx <= 0) return;
    const prev = items[idx - 1];
    await Promise.all([
      supabase.from('maskin_ko').update({ ordning: prev.ordning }).eq('id', koItem.id),
      supabase.from('maskin_ko').update({ ordning: koItem.ordning }).eq('id', prev.id),
    ]);
    await onRefresh();
  };

  const handleMoveDown = async (maskinId: string, koItem: MaskinKoItem) => {
    const items = maskinKo
      .filter(k => k.maskin_id === maskinId)
      .sort((a, b) => a.ordning - b.ordning);
    const idx = items.findIndex(k => k.id === koItem.id);
    if (idx >= items.length - 1) return;
    const next = items[idx + 1];
    await Promise.all([
      supabase.from('maskin_ko').update({ ordning: next.ordning }).eq('id', koItem.id),
      supabase.from('maskin_ko').update({ ordning: koItem.ordning }).eq('id', next.id),
    ]);
    await onRefresh();
  };

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '14px', color: '#666' }}>
          {maskiner.length} {maskiner.length === 1 ? 'maskin' : 'maskiner'}
        </div>
        <button onClick={() => setShowAddMaskin(true)} style={pillButton('primary')}>
          + Lägg till maskin
        </button>
      </div>

      {/* Maskinkort */}
      {maskiner.map((maskin) => {
        const koItems = maskinKo
          .filter(k => k.maskin_id === maskin.id)
          .sort((a, b) => a.ordning - b.ordning);
        const totalVolym = koItems.reduce((sum, k) => {
          const obj = objekt.find(o => o.id === k.objekt_id);
          return sum + (obj?.volym || 0);
        }, 0);

        return (
          <div key={maskin.id} style={cardStyle}>
            {/* Maskin-header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '2px' }}>
                  {maskin.typ === 'skördare' ? '🪚' : '🚜'} {maskin.namn}
                </div>
                <div style={{ fontSize: '13px', color: '#666' }}>
                  {maskin.typ === 'skördare' ? 'Skördare' : 'Skotare'}
                  {maskin.modell && ` · ${maskin.modell}`}
                </div>
              </div>
              <button
                onClick={() => handleDeleteMaskin(maskin.id)}
                style={{ background: 'none', border: 'none', color: '#666', fontSize: '18px', cursor: 'pointer', padding: '4px' }}
              >
                ✕
              </button>
            </div>

            {/* Kölista */}
            {koItems.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#444', fontSize: '13px', borderRadius: '10px', background: '#0a0a0a' }}>
                Ingen kö — lägg till objekt
              </div>
            ) : (
              <div style={{ borderRadius: '10px', overflow: 'hidden', background: '#0a0a0a', marginBottom: '8px' }}>
                {koItems.map((ki, idx) => {
                  const obj = objekt.find(o => o.id === ki.objekt_id);
                  if (!obj) return null;
                  return (
                    <div key={ki.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '12px 14px',
                      borderBottom: idx < koItems.length - 1 ? '1px solid #1a1a1a' : 'none',
                    }}>
                      {/* Ordningsnummer */}
                      <div style={{ width: '24px', fontSize: '14px', color: '#666', fontWeight: '600', flexShrink: 0 }}>
                        {idx + 1}.
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {obj.namn}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          {obj.typ === 'slutavverkning' ? 'Slutavv.' : 'Gallring'} · {obj.volym || 0} m³
                        </div>
                      </div>
                      {/* Pilar */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginLeft: '8px' }}>
                        <button
                          onClick={() => handleMoveUp(maskin.id, ki)}
                          disabled={idx === 0}
                          style={{
                            background: 'none', border: 'none', color: idx === 0 ? '#333' : '#888',
                            fontSize: '14px', cursor: idx === 0 ? 'default' : 'pointer', padding: '2px 6px',
                          }}
                        >▲</button>
                        <button
                          onClick={() => handleMoveDown(maskin.id, ki)}
                          disabled={idx === koItems.length - 1}
                          style={{
                            background: 'none', border: 'none', color: idx === koItems.length - 1 ? '#333' : '#888',
                            fontSize: '14px', cursor: idx === koItems.length - 1 ? 'default' : 'pointer', padding: '2px 6px',
                          }}
                        >▼</button>
                      </div>
                      {/* Ta bort */}
                      <button
                        onClick={() => handleRemoveFromKo(ki.id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '16px', cursor: 'pointer', marginLeft: '8px', padding: '4px' }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Total + lägg till */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
              <div style={{ fontSize: '13px', color: '#666' }}>
                Total: <span style={{ color: '#fff', fontWeight: '600' }}>{formatVolym(totalVolym)}</span>
              </div>
              <button
                onClick={() => setAddingToMaskin(maskin.id)}
                style={{ background: 'none', border: '1px solid #333', color: '#fff', fontSize: '13px', padding: '6px 14px', borderRadius: '10px', cursor: 'pointer' }}
              >
                + Lägg till objekt
              </button>
            </div>
          </div>
        );
      })}

      {/* Tom state */}
      {maskiner.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#666' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🪚</div>
          <div style={{ fontSize: '16px', marginBottom: '8px' }}>Inga maskiner ännu</div>
          <div style={{ fontSize: '13px' }}>Klicka "Lägg till maskin" för att börja</div>
        </div>
      )}

      {/* Modal: Lägg till maskin */}
      {showAddMaskin && (
        <div style={modalOverlay} onClick={() => setShowAddMaskin(false)}>
          <div style={modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '40px', height: '4px', backgroundColor: '#333', borderRadius: '2px', margin: '0 auto 20px' }} />
            <h2 style={{ margin: '0 0 20px', fontSize: '20px', fontWeight: '600' }}>Lägg till maskin</h2>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '6px' }}>Namn *</label>
              <input
                value={newNamn}
                onChange={(e) => setNewNamn(e.target.value)}
                placeholder="T.ex. Ponsse Scorpion"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '6px' }}>Typ</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['skördare', 'skotare'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setNewTyp(t)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '10px',
                      border: newTyp === t ? '1px solid #fff' : '1px solid #333',
                      background: newTyp === t ? '#222' : 'transparent',
                      color: '#fff',
                      fontSize: '14px',
                      cursor: 'pointer',
                    }}
                  >
                    {t === 'skördare' ? '🪚 Skördare' : '🚜 Skotare'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '6px' }}>Modell (valfritt)</label>
              <input
                value={newModell}
                onChange={(e) => setNewModell(e.target.value)}
                placeholder="T.ex. Giant 8W"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowAddMaskin(false)} style={{ ...pillButton('secondary'), flex: 1 }}>
                Avbryt
              </button>
              <button onClick={handleAddMaskin} disabled={saving || !newNamn.trim()} style={{ ...pillButton('primary'), flex: 1, opacity: !newNamn.trim() ? 0.5 : 1 }}>
                {saving ? 'Sparar...' : 'Lägg till'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Lägg till objekt i kö */}
      {addingToMaskin && (
        <div style={modalOverlay} onClick={() => { setAddingToMaskin(null); setSearchText(''); }}>
          <div style={modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '40px', height: '4px', backgroundColor: '#333', borderRadius: '2px', margin: '0 auto 20px' }} />
            <h2 style={{ margin: '0 0 16px', fontSize: '20px', fontWeight: '600' }}>Lägg till objekt</h2>

            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Sök objekt..."
              style={{ ...inputStyle, marginBottom: '12px' }}
              autoFocus
            />

            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {objekt
                .filter(o => !maskinKo.some(k => k.maskin_id === addingToMaskin && k.objekt_id === o.id))
                .filter(o => !searchText || o.namn?.toLowerCase().includes(searchText.toLowerCase()))
                .map((o) => (
                  <div
                    key={o.id}
                    onClick={() => handleAddToKo(addingToMaskin, o.id)}
                    style={{
                      padding: '12px 14px',
                      borderBottom: '1px solid #1a1a1a',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: '500' }}>{o.namn}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {o.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring'} · {o.volym || 0} m³
                    </div>
                  </div>
                ))}
              {objekt.filter(o => !maskinKo.some(k => k.maskin_id === addingToMaskin && k.objekt_id === o.id)).length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
                  Alla objekt är redan i kön
                </div>
              )}
            </div>

            <button onClick={() => { setAddingToMaskin(null); setSearchText(''); }} style={{ ...pillButton('secondary'), width: '100%', marginTop: '12px' }}>
              Stäng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
