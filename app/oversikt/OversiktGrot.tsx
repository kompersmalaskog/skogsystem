'use client';

import React, { useState } from 'react';
import { OversiktObjekt, C } from './oversikt-types';
import { ff } from './oversikt-styles';
import { formatVolym } from './oversikt-utils';

interface Props {
  objekt: OversiktObjekt[];
  supabase: any;
  onRefresh: () => Promise<void>;
}

export default function OversiktGrot({ objekt, supabase, onRefresh }: Props) {
  const [selG, setSelG] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, { grot_status: string; grot_volym: string; grot_anteckning: string }>>({});
  const [saving, setSaving] = useState(false);

  // GROT applies to slutavverkning objects
  const grotObjekt = objekt.filter(o => o.typ === 'slutavverkning');

  const handleExpand = (id: string) => {
    if (selG === id) {
      setSelG(null);
    } else {
      setSelG(id);
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
    setSelG(null);
    await onRefresh();
  };

  // Estimate loads: ~20 m³ per load
  const getLass = (vol: number | null) => vol ? Math.ceil(vol / 20) : 0;

  // "Bråttom" heuristic: has anteckning mentioning urgent keywords, or grot_volym > 100
  const isBrattom = (o: OversiktObjekt) => {
    if (!o.grot_anteckning) return false;
    const t = o.grot_anteckning.toLowerCase();
    return t.includes('bråttom') || t.includes('plantering') || t.includes('markbered');
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 16px 80px', fontFamily: ff }}>
      {grotObjekt.map(obj => {
        const s = selG === obj.id;
        const isKlar = (obj.grot_status || 'ej_aktuellt') === 'bortkord';
        const vals = editValues[obj.id] || {
          grot_status: obj.grot_status || 'ej_aktuellt',
          grot_volym: obj.grot_volym?.toString() || '',
          grot_anteckning: obj.grot_anteckning || '',
        };
        const lass = getLass(obj.grot_volym);
        const brattom = isBrattom(obj);

        return (
          <div key={obj.id} onClick={() => handleExpand(obj.id)} style={{
            background: s ? C.card : 'transparent', borderRadius: 14,
            padding: s ? 16 : 14, margin: s ? '6px 0' : 0,
            borderBottom: s ? 'none' : `1px solid ${C.border}`,
            cursor: 'pointer', opacity: isKlar ? 0.35 : 1, transition: 'all 0.15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Blue left bar */}
              <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: C.blue, opacity: s ? 0.5 : 0.15 }} />
              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{obj.namn}</span>
                  {brattom && !isKlar && (
                    <span style={{ fontSize: 9, fontWeight: 500, color: C.yellow, padding: '2px 8px', background: C.yd, borderRadius: 5 }}>Bråttom</span>
                  )}
                  {isKlar && <span style={{ fontSize: 9, color: C.t3 }}>Klar</span>}
                </div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{obj.vo_nummer || ''}</div>
              </div>
              {/* Volume + loads */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {obj.grot_volym ? formatVolym(obj.grot_volym) : '–'}
                  <span style={{ fontSize: 10, fontWeight: 400, color: C.t4 }}> m³</span>
                </div>
                {lass > 0 && <div style={{ fontSize: 10, color: C.t3 }}>{lass} lass</div>}
              </div>
            </div>

            {/* Expanded edit */}
            {s && !isKlar && (
              <div style={{ marginTop: 8, animation: 'fadeIn .15s' }} onClick={(e) => e.stopPropagation()}>
                {/* Status buttons */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                  {[
                    { k: 'ej_aktuellt', l: 'Ej aktuellt' },
                    { k: 'skotad', l: 'Skotad' },
                    { k: 'hoglagd', l: 'Höglagd' },
                    { k: 'flisad', l: 'Flisad' },
                    { k: 'bortkord', l: 'Borttransporterad' },
                  ].map(st => (
                    <button key={st.k} onClick={() => setEditValues(prev => ({ ...prev, [obj.id]: { ...vals, grot_status: st.k } }))}
                      style={{
                        padding: '5px 12px', borderRadius: 8,
                        border: vals.grot_status === st.k ? `1px solid ${C.blue}` : `1px solid ${C.border}`,
                        background: vals.grot_status === st.k ? C.bd : 'transparent',
                        color: vals.grot_status === st.k ? C.blue : C.t3,
                        fontSize: 11, cursor: 'pointer', fontFamily: ff,
                      }}>{st.l}</button>
                  ))}
                </div>

                {/* Volume input */}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, color: C.t4, display: 'block', marginBottom: 4 }}>GROT-volym (m³)</label>
                  <input type="number" value={vals.grot_volym}
                    onChange={(e) => setEditValues(prev => ({ ...prev, [obj.id]: { ...vals, grot_volym: e.target.value } }))}
                    style={{ width: 120, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.t1, fontSize: 13, outline: 'none', fontFamily: ff }} />
                </div>

                {/* Note */}
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 10, color: C.t4, display: 'block', marginBottom: 4 }}>Notering</label>
                  <textarea value={vals.grot_anteckning}
                    onChange={(e) => setEditValues(prev => ({ ...prev, [obj.id]: { ...vals, grot_anteckning: e.target.value } }))}
                    rows={2} placeholder="T.ex. Plantering v.14"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.t1, fontSize: 12, outline: 'none', resize: 'vertical', fontFamily: ff }} />
                </div>

                <button onClick={() => handleSave(obj.id)} disabled={saving}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.5 : 1, fontFamily: ff }}>
                  {saving ? 'Sparar...' : 'Spara'}
                </button>
              </div>
            )}

            {/* Expanded note (read-only for klar) */}
            {s && isKlar && obj.grot_anteckning && (
              <div style={{ marginTop: 8, fontSize: 11, color: C.t3, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, animation: 'fadeIn .15s' }}>
                📋 {obj.grot_anteckning}
              </div>
            )}

            {/* Show note preview when expanded and not klar */}
            {s && !isKlar && obj.grot_anteckning && !editValues[obj.id] && (
              <div style={{ marginTop: 8, fontSize: 11, color: C.t3, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                📋 {obj.grot_anteckning}
              </div>
            )}
          </div>
        );
      })}

      {grotObjekt.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: C.t4 }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>Inga slutavverkningsobjekt</div>
          <div style={{ fontSize: 11 }}>GROT hanteras för slutavverkning</div>
        </div>
      )}
    </div>
  );
}
