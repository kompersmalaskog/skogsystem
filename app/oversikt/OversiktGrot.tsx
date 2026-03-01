'use client';

import React, { useState } from 'react';
import { OversiktObjekt } from './oversikt-types';
import { inputStyle, footerStyle } from './oversikt-styles';
import { getGrotStatusLabel, getGrotStatusColor, formatVolym } from './oversikt-utils';

interface Props {
  objekt: OversiktObjekt[];
  supabase: any;
  onRefresh: () => Promise<void>;
}

const GROT_STATUSES = [
  { key: 'ej_aktuellt', label: 'Ej aktuellt' },
  { key: 'skotad', label: 'Skotad' },
  { key: 'hoglagd', label: 'Höglagd' },
  { key: 'flisad', label: 'Flisad' },
  { key: 'bortkord', label: 'Borttransporterad' },
];

export default function OversiktGrot({ objekt, supabase, onRefresh }: Props) {
  const [statusFilter, setStatusFilter] = useState<string>('alla');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, { grot_status: string; grot_volym: string; grot_anteckning: string }>>({});
  const [saving, setSaving] = useState(false);

  // Visa bara slutavverkning (GROT-potential)
  let lista = objekt.filter(o => o.typ === 'slutavverkning');

  if (statusFilter !== 'alla') {
    lista = lista.filter(o => (o.grot_status || 'ej_aktuellt') === statusFilter);
  }

  const getEditValue = (obj: OversiktObjekt) => {
    return editValues[obj.id] || {
      grot_status: obj.grot_status || 'ej_aktuellt',
      grot_volym: obj.grot_volym?.toString() || '',
      grot_anteckning: obj.grot_anteckning || '',
    };
  };

  const handleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      const obj = objekt.find(o => o.id === id);
      if (obj && !editValues[id]) {
        setEditValues(prev => ({
          ...prev,
          [id]: {
            grot_status: obj.grot_status || 'ej_aktuellt',
            grot_volym: obj.grot_volym?.toString() || '',
            grot_anteckning: obj.grot_anteckning || '',
          },
        }));
      }
    }
  };

  const handleSave = async (id: string) => {
    const vals = editValues[id];
    if (!vals) return;
    setSaving(true);
    await supabase.from('objekt').update({
      grot_status: vals.grot_status,
      grot_volym: vals.grot_volym ? parseFloat(vals.grot_volym) : null,
      grot_anteckning: vals.grot_anteckning || null,
    }).eq('id', id);
    setSaving(false);
    setExpandedId(null);
    await onRefresh();
  };

  const grotTotal = lista.reduce((sum, o) => sum + (o.grot_volym || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Filter */}
      <div style={{ display: 'flex', gap: '6px', padding: '12px 20px', overflowX: 'auto' }}>
        <button
          onClick={() => setStatusFilter('alla')}
          style={{
            padding: '6px 14px',
            borderRadius: '16px',
            border: statusFilter === 'alla' ? '1px solid #fff' : '1px solid #333',
            background: statusFilter === 'alla' ? '#fff' : 'transparent',
            color: statusFilter === 'alla' ? '#000' : '#fff',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Alla ({lista.length})
        </button>
        {GROT_STATUSES.filter(s => s.key !== 'ej_aktuellt').map((s) => {
          const count = objekt.filter(o => o.typ === 'slutavverkning' && (o.grot_status || 'ej_aktuellt') === s.key).length;
          return (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              style={{
                padding: '6px 14px',
                borderRadius: '16px',
                border: statusFilter === s.key ? `1px solid ${getGrotStatusColor(s.key)}` : '1px solid #333',
                background: statusFilter === s.key ? getGrotStatusColor(s.key) : 'transparent',
                color: '#fff',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {s.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {lista.map((obj) => {
          const expanded = expandedId === obj.id;
          const vals = getEditValue(obj);
          const grotStatus = obj.grot_status || 'ej_aktuellt';

          return (
            <div key={obj.id}>
              <div
                onClick={() => handleExpand(obj.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px 20px',
                  borderBottom: expanded ? 'none' : '1px solid #1a1a1a',
                  cursor: 'pointer',
                }}
              >
                {/* Status-prick */}
                <div style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: getGrotStatusColor(grotStatus),
                  marginRight: '14px',
                  flexShrink: 0,
                }} />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: '500', marginBottom: '3px' }}>
                    {obj.namn}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {obj.volym || 0} m³ · GROT: {getGrotStatusLabel(grotStatus)}
                    {obj.grot_volym ? ` · ${obj.grot_volym} m³s` : ''}
                  </div>
                </div>

                {/* Expandera-pil */}
                <div style={{ color: '#666', fontSize: '16px', marginLeft: '8px' }}>
                  {expanded ? '▲' : '▼'}
                </div>
              </div>

              {/* Expanderad vy */}
              {expanded && (
                <div style={{
                  padding: '0 20px 16px 44px',
                  borderBottom: '1px solid #1a1a1a',
                  background: '#0a0a0a',
                }}>
                  {/* Status-dropdown */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>GROT-status</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {GROT_STATUSES.map((s) => (
                        <button
                          key={s.key}
                          onClick={() => setEditValues(prev => ({ ...prev, [obj.id]: { ...vals, grot_status: s.key } }))}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '10px',
                            border: vals.grot_status === s.key ? `1px solid ${getGrotStatusColor(s.key)}` : '1px solid #333',
                            background: vals.grot_status === s.key ? getGrotStatusColor(s.key) + '33' : 'transparent',
                            color: vals.grot_status === s.key ? getGrotStatusColor(s.key) : '#888',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* GROT-volym */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>GROT-volym (m³s)</label>
                    <input
                      type="number"
                      value={vals.grot_volym}
                      onChange={(e) => setEditValues(prev => ({ ...prev, [obj.id]: { ...vals, grot_volym: e.target.value } }))}
                      placeholder="0"
                      style={{ ...inputStyle, maxWidth: '150px' }}
                    />
                  </div>

                  {/* Anteckning */}
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Anteckning</label>
                    <textarea
                      value={vals.grot_anteckning}
                      onChange={(e) => setEditValues(prev => ({ ...prev, [obj.id]: { ...vals, grot_anteckning: e.target.value } }))}
                      placeholder="Anteckningar om GROT..."
                      rows={3}
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </div>

                  {/* Spara */}
                  <button
                    onClick={() => handleSave(obj.id)}
                    disabled={saving}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '10px',
                      border: 'none',
                      background: '#fff',
                      color: '#000',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    {saving ? 'Sparar...' : 'Spara'}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {lista.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#666' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🌿</div>
            <div style={{ fontSize: '16px', marginBottom: '8px' }}>Inga slutavverkningsobjekt</div>
            <div style={{ fontSize: '13px' }}>GROT hanteras för slutavverkning</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={footerStyle}>
        <span style={{ color: '#666', fontSize: '13px' }}>
          {lista.length} objekt · GROT-volym:{' '}
        </span>
        <span style={{ fontSize: '15px', fontWeight: '600' }}>
          {grotTotal > 0 ? formatVolym(grotTotal).replace('m³', 'm³s') : '—'}
        </span>
      </div>
    </div>
  );
}
