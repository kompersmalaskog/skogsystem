'use client';

import React, { useState } from 'react';
import { OversiktObjekt } from './oversikt-types';
import { inputStyle, footerStyle } from './oversikt-styles';
import { getStatusColor, getStatusLabel, formatVolym, getMonadNamn } from './oversikt-utils';

interface Props {
  objekt: OversiktObjekt[];
}

type SortKey = 'namn' | 'volym' | 'status';

export default function OversiktObjektLista({ objekt }: Props) {
  const [typFilter, setTypFilter] = useState<'alla' | 'slutavverkning' | 'gallring'>('alla');
  const [statusFilter, setStatusFilter] = useState<string>('alla');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('namn');

  let lista = [...objekt];

  // Typ-filter
  if (typFilter !== 'alla') {
    lista = lista.filter(o => o.typ === typFilter);
  }

  // Status-filter
  if (statusFilter !== 'alla') {
    lista = lista.filter(o => o.status === statusFilter);
  }

  // Sök
  if (search.trim()) {
    const s = search.toLowerCase();
    lista = lista.filter(o => o.namn?.toLowerCase().includes(s) || o.bolag?.toLowerCase().includes(s) || o.markagare?.toLowerCase().includes(s));
  }

  // Sortering
  lista.sort((a, b) => {
    if (sortBy === 'volym') return (b.volym || 0) - (a.volym || 0);
    if (sortBy === 'status') {
      const order = ['pagaende', 'planerad', 'importerad', 'klar'];
      return order.indexOf(a.status || '') - order.indexOf(b.status || '');
    }
    return (a.namn || '').localeCompare(b.namn || '', 'sv');
  });

  const totalVolym = lista.reduce((sum, o) => sum + (o.volym || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sök */}
      <div style={{ padding: '12px 20px 0' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök objekt, bolag, markägare..."
          style={inputStyle}
        />
      </div>

      {/* Filterknappar */}
      <div style={{ display: 'flex', gap: '6px', padding: '12px 20px', overflowX: 'auto' }}>
        {[
          { key: 'alla', label: 'Alla' },
          { key: 'slutavverkning', label: 'Slutavv.' },
          { key: 'gallring', label: 'Gallring' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setTypFilter(f.key as any)}
            style={{
              padding: '6px 14px',
              borderRadius: '16px',
              border: typFilter === f.key ? '1px solid #fff' : '1px solid #333',
              background: typFilter === f.key ? '#fff' : 'transparent',
              color: typFilter === f.key ? '#000' : '#fff',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {f.label}
          </button>
        ))}
        <div style={{ width: '1px', background: '#333', margin: '0 4px' }} />
        {[
          { key: 'alla', label: 'Alla' },
          { key: 'importerad', label: 'Import.' },
          { key: 'planerad', label: 'Planad' },
          { key: 'pagaende', label: 'Pågå.' },
          { key: 'klar', label: 'Klar' },
        ].map((f) => (
          <button
            key={'s' + f.key}
            onClick={() => setStatusFilter(f.key)}
            style={{
              padding: '6px 14px',
              borderRadius: '16px',
              border: statusFilter === f.key ? '1px solid #3b82f6' : '1px solid #333',
              background: statusFilter === f.key ? '#3b82f6' : 'transparent',
              color: '#fff',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Sortering */}
      <div style={{ display: 'flex', gap: '8px', padding: '0 20px 8px', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: '#666' }}>Sortera:</span>
        {[
          { key: 'namn', label: 'Namn' },
          { key: 'volym', label: 'Volym' },
          { key: 'status', label: 'Status' },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setSortBy(s.key as SortKey)}
            style={{
              background: 'none',
              border: 'none',
              color: sortBy === s.key ? '#fff' : '#666',
              fontSize: '12px',
              cursor: 'pointer',
              padding: '4px 8px',
              textDecoration: sortBy === s.key ? 'underline' : 'none',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {lista.map((obj) => (
          <div
            key={obj.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '16px 20px',
              borderBottom: '1px solid #1a1a1a',
            }}
          >
            {/* Status-prick */}
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: getStatusColor(obj.status),
              marginRight: '14px',
              flexShrink: 0,
            }} />

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '15px', fontWeight: '500', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {obj.namn}
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                {obj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring'}
                {obj.bolag && ` · ${obj.bolag}`}
              </div>
              <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>
                {getStatusLabel(obj.status)}
                {obj.ar && obj.manad && ` · ${getMonadNamn(obj.manad)} ${obj.ar}`}
              </div>
            </div>

            {/* Volym */}
            <div style={{ textAlign: 'right', marginLeft: '12px', flexShrink: 0 }}>
              <div style={{ fontSize: '15px', fontWeight: '500' }}>{obj.volym || 0}</div>
              <div style={{ fontSize: '11px', color: '#666' }}>m³</div>
            </div>

            {/* Planering-länk */}
            <button
              onClick={() => window.location.href = `/planering?objekt=${obj.id}`}
              style={{
                marginLeft: '12px',
                background: 'none',
                border: '1px solid #333',
                color: '#fff',
                fontSize: '12px',
                padding: '6px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              →
            </button>
          </div>
        ))}

        {lista.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#666' }}>
            Inga objekt matchar filtret
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={footerStyle}>
        <span style={{ color: '#666', fontSize: '13px' }}>
          {lista.length} objekt · Total:{' '}
        </span>
        <span style={{ fontSize: '15px', fontWeight: '600' }}>
          {formatVolym(totalVolym)}
        </span>
      </div>
    </div>
  );
}
