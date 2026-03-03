'use client';

import React, { useState, useMemo } from 'react';
import { OversiktObjekt, C } from './oversikt-types';
import { ff } from './oversikt-styles';
import { formatVolym, grotDeadlineDays } from './oversikt-utils';

interface Props {
  objekt: OversiktObjekt[];
  supabase: any;
  onRefresh: () => Promise<void>;
}

export default function OversiktGrot({ objekt, supabase, onRefresh }: Props) {
  const [selG, setSelG] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, { grot_volym: string; grot_anteckning: string; grot_deadline: string }>>({});
  const [saving, setSaving] = useState(false);

  const isSkotat = (o: OversiktObjekt) => o.grot_status === 'skotat' || o.grot_status === 'hoglagd' || o.grot_status === 'flisad' || o.grot_status === 'borttransporterad' || o.grot_status === 'bortkord';

  // Slutavverkning objects, sorted by deadline urgency
  const grotObjekt = useMemo(() => {
    const list = objekt.filter(o => o.typ === 'slutavverkning');
    return list.sort((a, b) => {
      const sa = isSkotat(a);
      const sb = isSkotat(b);
      // Skotat at the bottom
      if (sa !== sb) return sa ? 1 : -1;
      // Both have deadline: earliest first
      if (a.grot_deadline && b.grot_deadline) return a.grot_deadline.localeCompare(b.grot_deadline);
      if (a.grot_deadline && !b.grot_deadline) return -1;
      if (!a.grot_deadline && b.grot_deadline) return 1;
      return a.namn.localeCompare(b.namn);
    });
  }, [objekt]);

  const handleExpand = (id: string) => {
    if (selG === id) { setSelG(null); return; }
    setSelG(id);
    const obj = objekt.find(o => o.id === id);
    if (obj && !editValues[id]) {
      setEditValues(prev => ({
        ...prev,
        [id]: {
          grot_volym: obj.grot_volym?.toString() || '',
          grot_anteckning: obj.grot_anteckning || '',
          grot_deadline: obj.grot_deadline || '',
        },
      }));
    }
  };

  const handleSave = async (id: string) => {
    const vals = editValues[id];
    if (!vals) return;
    setSaving(true);
    await supabase.from('objekt').update({
      grot_volym: vals.grot_volym ? parseFloat(vals.grot_volym) : null,
      grot_anteckning: vals.grot_anteckning || null,
      grot_deadline: vals.grot_deadline || null,
    }).eq('id', id);
    setSaving(false);
    setSelG(null);
    await onRefresh();
  };

  const handleToggleSkotat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const obj = objekt.find(o => o.id === id);
    if (!obj || saving) return;
    const currently = isSkotat(obj);
    const newStatus = currently ? 'ej_aktuellt' : 'skotat';
    setSaving(true);
    await supabase.from('objekt').update({ grot_status: newStatus }).eq('id', id);
    setSaving(false);
    await onRefresh();
  };

  const getLass = (vol: number | null) => vol ? Math.ceil(vol / 20) : 0;

  const formatDeadline = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 16px 80px', fontFamily: ff }}>
      {grotObjekt.map(obj => {
        const s = selG === obj.id;
        const skotat = isSkotat(obj);
        const lass = getLass(obj.grot_volym);
        const deadlineDays = grotDeadlineDays(obj.grot_deadline);
        const isOverdue = !skotat && deadlineDays !== null && deadlineDays < 0;
        const isUrgent = !skotat && deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 14;
        const leftClr = isOverdue ? C.red : isUrgent ? C.yellow : skotat ? C.green : C.t4;

        const vals = editValues[obj.id] || {
          grot_volym: obj.grot_volym?.toString() || '',
          grot_anteckning: obj.grot_anteckning || '',
          grot_deadline: obj.grot_deadline || '',
        };

        return (
          <div key={obj.id} onClick={() => handleExpand(obj.id)} style={{
            background: s ? C.card : 'transparent', borderRadius: 14,
            padding: s ? 16 : 14, margin: s ? '6px 0' : 0,
            borderBottom: s ? 'none' : `1px solid ${C.border}`,
            cursor: 'pointer', opacity: skotat ? 0.4 : 1, transition: 'all 0.15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Left bar */}
              <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: leftClr, opacity: s ? 0.7 : 0.35 }} />

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{obj.namn}</span>
                  {isOverdue && (
                    <span style={{ fontSize: 9, fontWeight: 600, color: C.red, padding: '2px 8px', background: C.rd, borderRadius: 5 }}>Försenad</span>
                  )}
                  {isUrgent && (
                    <span style={{ fontSize: 9, fontWeight: 600, color: C.yellow, padding: '2px 8px', background: C.yd, borderRadius: 5 }}>
                      {deadlineDays === 0 ? 'Idag' : `${deadlineDays}d kvar`}
                    </span>
                  )}
                </div>
                {obj.grot_deadline && !skotat && (
                  <div style={{ fontSize: 10, color: isOverdue ? C.red : isUrgent ? C.yellow : C.t3, marginTop: 2 }}>
                    Senast: {formatDeadline(obj.grot_deadline)}
                  </div>
                )}
                {!obj.grot_deadline && obj.vo_nummer && (
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{obj.vo_nummer}</div>
                )}
              </div>

              {/* Volume */}
              <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {obj.grot_volym ? formatVolym(obj.grot_volym) : '–'}
                  <span style={{ fontSize: 10, fontWeight: 400, color: C.t4 }}> m³</span>
                </div>
                {lass > 0 && <div style={{ fontSize: 10, color: C.t3 }}>{lass} lass</div>}
              </div>

              {/* Toggle: Skotat */}
              <button
                onClick={(e) => handleToggleSkotat(obj.id, e)}
                disabled={saving}
                style={{
                  flexShrink: 0, padding: '6px 14px', borderRadius: 20,
                  border: skotat ? 'none' : `1px solid ${C.border}`,
                  background: skotat ? C.green : 'transparent',
                  color: skotat ? '#fff' : C.t2,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: ff,
                  transition: 'all 0.2s', opacity: saving ? 0.5 : 1,
                }}
              >
                {skotat ? 'Skotat' : 'Ej skotat'}
              </button>
            </div>

            {/* Expanded edit panel */}
            {s && (
              <div style={{ marginTop: 12, animation: 'fadeIn .15s' }} onClick={(e) => e.stopPropagation()}>
                {/* Volume */}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, color: C.t4, display: 'block', marginBottom: 4 }}>GROT-volym (m³)</label>
                  <input type="number" value={vals.grot_volym}
                    onChange={(e) => setEditValues(prev => ({ ...prev, [obj.id]: { ...vals, grot_volym: e.target.value } }))}
                    style={{ width: 120, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.t1, fontSize: 13, outline: 'none', fontFamily: ff }} />
                </div>

                {/* Deadline */}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, color: C.t4, display: 'block', marginBottom: 4 }}>Ska vara borta senast</label>
                  <input type="date" value={vals.grot_deadline}
                    onChange={(e) => setEditValues(prev => ({ ...prev, [obj.id]: { ...vals, grot_deadline: e.target.value } }))}
                    style={{ width: 170, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.t1, fontSize: 13, outline: 'none', fontFamily: ff, colorScheme: 'dark' }} />
                </div>

                {/* Note */}
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 10, color: C.t4, display: 'block', marginBottom: 4 }}>Notering</label>
                  <textarea value={vals.grot_anteckning}
                    onChange={(e) => setEditValues(prev => ({ ...prev, [obj.id]: { ...vals, grot_anteckning: e.target.value } }))}
                    rows={2} placeholder="T.ex. Plantering v.14"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.t1, fontSize: 12, outline: 'none', resize: 'vertical', fontFamily: ff, boxSizing: 'border-box' }} />
                </div>

                <button onClick={() => handleSave(obj.id)} disabled={saving}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: C.green, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.5 : 1, fontFamily: ff }}>
                  {saving ? 'Sparar...' : 'Spara'}
                </button>
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
